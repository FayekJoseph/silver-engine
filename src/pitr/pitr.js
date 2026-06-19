'use strict';

// Point-In-Time Recovery (PITR) for the Silver Engine.
//
// This is the engine's Support heart: it captures verifiable snapshots of a
// target's state and recovers that state on demand. Every snapshot carries a
// cryptographic fingerprint (Identity) and per-file hashes (Integrity), so a
// recovery can be *proven* correct rather than merely assumed.

const fs = require('fs');
const path = require('path');

const { hash, fingerprintFiles } = require('./fingerprint');
const { SnapshotStore } = require('./store');

const DEFAULT_EXCLUDES = ['.git', 'node_modules', '.pitr'];

class PITR {
  /**
   * @param {object} options
   * @param {string} options.target  directory whose state is protected
   * @param {string} [options.store] store root (defaults to `<target>/.pitr`)
   * @param {string[]} [options.exclude] top-level names to skip when capturing
   */
  constructor({ target, store, exclude } = {}) {
    if (!target) throw new Error('PITR requires a target directory');
    this.target = path.resolve(target);
    this.store = new SnapshotStore(store || path.join(this.target, '.pitr'));
    this.exclude = new Set(exclude || DEFAULT_EXCLUDES);
  }

  /**
   * Capture the current state of the target as an immutable snapshot.
   * @param {object} [options]
   * @param {string} [options.label] human-friendly description
   * @returns {object} the snapshot manifest
   */
  snapshot({ label } = {}) {
    this.store.init();

    const relPaths = this._walk(this.target).sort();
    const contents = new Map();
    const files = relPaths.map((relPath) => {
      const buffer = fs.readFileSync(path.join(this.target, relPath));
      contents.set(relPath, buffer);
      return { path: relPath, sha256: hash(buffer), size: buffer.length };
    });

    const fingerprint = fingerprintFiles(files);
    const createdAt = new Date().toISOString();
    // A monotonic sequence keeps ordering deterministic even when two
    // snapshots are captured within the same millisecond.
    const seq = this.store.list().length;
    const id = `${String(seq).padStart(6, '0')}_${createdAt.replace(/[:.]/g, '-')}_${fingerprint.slice(0, 12)}`;

    const manifest = {
      id,
      seq,
      createdAt,
      label: label || null,
      target: this.target,
      fileCount: files.length,
      fingerprint,
      files,
    };

    this.store.write(manifest, contents);
    return manifest;
  }

  /** @returns {object[]} snapshot summaries, oldest first */
  list() {
    return this.store.list().map((id) => {
      const m = this.store.readManifest(id);
      return {
        id: m.id,
        createdAt: m.createdAt,
        label: m.label,
        fileCount: m.fileCount,
        fingerprint: m.fingerprint,
      };
    });
  }

  /** @param {string} id */
  get(id) {
    return this.store.readManifest(id);
  }

  /**
   * Compare two snapshots and evaluate the change between them — the trace
   * that lets the tool, not a guess, report exactly what moved between two
   * points in time. Direction is from A to B (A is the older baseline).
   *
   * @param {string} idA baseline snapshot
   * @param {string} idB later snapshot
   * @returns {{from: string, to: string, identical: boolean,
   *            added: string[], removed: string[], modified: string[],
   *            unchanged: number}}
   */
  compare(idA, idB) {
    const a = this.store.readManifest(idA);
    const b = this.store.readManifest(idB);
    const inA = new Map(a.files.map((f) => [f.path, f.sha256]));
    const inB = new Map(b.files.map((f) => [f.path, f.sha256]));

    const added = [];
    const modified = [];
    let unchanged = 0;
    for (const [path, sha] of inB) {
      if (!inA.has(path)) added.push(path);
      else if (inA.get(path) !== sha) modified.push(path);
      else unchanged += 1;
    }
    const removed = [...inA.keys()].filter((path) => !inB.has(path));

    return {
      from: idA,
      to: idB,
      identical: a.fingerprint === b.fingerprint,
      added: added.sort(),
      removed: removed.sort(),
      modified: modified.sort(),
      unchanged,
    };
  }

  /**
   * Verify a snapshot's stored contents against its manifest. This is the
   * "tool verification" step: it proves the snapshot itself has not been
   * tampered with or corrupted before it is ever used for recovery.
   *
   * @param {string} id
   * @returns {{ok: boolean, fingerprint: string, errors: string[]}}
   */
  verifySnapshot(id) {
    const manifest = this.store.readManifest(id);
    const errors = [];

    for (const entry of manifest.files) {
      let actual;
      try {
        actual = hash(this.store.readFile(id, entry.path));
      } catch (err) {
        errors.push(`missing stored file: ${entry.path}`);
        continue;
      }
      if (actual !== entry.sha256) {
        errors.push(`hash mismatch for ${entry.path}`);
      }
    }

    const recomputed = fingerprintFiles(manifest.files);
    if (recomputed !== manifest.fingerprint) {
      errors.push('manifest fingerprint does not match file hashes');
    }

    return { ok: errors.length === 0, fingerprint: manifest.fingerprint, errors };
  }

  /**
   * Verify that the *live* target currently matches a snapshot exactly. Useful
   * for tamper detection (Integrity heart) without performing a restore.
   *
   * @param {string} id
   * @param {object} [options]
   * @param {boolean} [options.exact=true] flag files present in target but not
   *   in the snapshot. Set false to allow extra (newer) files.
   * @returns {{ok: boolean, errors: string[]}}
   */
  verifyTarget(id, { exact = true } = {}) {
    const manifest = this.store.readManifest(id);
    const expected = new Map(manifest.files.map((f) => [f.path, f.sha256]));
    const actualPaths = new Set(this._walk(this.target));
    const errors = [];

    for (const [relPath, sha] of expected) {
      if (!actualPaths.has(relPath)) {
        errors.push(`missing in target: ${relPath}`);
        continue;
      }
      const actual = hash(fs.readFileSync(path.join(this.target, relPath)));
      if (actual !== sha) errors.push(`modified in target: ${relPath}`);
    }
    if (exact) {
      for (const relPath of actualPaths) {
        if (!expected.has(relPath)) errors.push(`unexpected in target: ${relPath}`);
      }
    }

    return { ok: errors.length === 0, errors };
  }

  /**
   * Recover the target to the exact state of a snapshot.
   *
   * The snapshot is verified first and the recovery is verified afterwards, so
   * `restore` only resolves successfully when the target provably equals the
   * captured point in time.
   *
   * @param {string} id
   * @param {object} [options]
   * @param {boolean} [options.prune=true] remove files not present in snapshot
   * @returns {{id: string, fingerprint: string, restored: number, pruned: string[]}}
   */
  restore(id, { prune = true } = {}) {
    const check = this.verifySnapshot(id);
    if (!check.ok) {
      throw new Error(`Refusing to restore corrupt snapshot ${id}: ${check.errors.join('; ')}`);
    }

    const manifest = this.store.readManifest(id);
    const keep = new Set(manifest.files.map((f) => f.path));
    const pruned = [];

    if (prune) {
      for (const relPath of this._walk(this.target)) {
        if (!keep.has(relPath)) {
          fs.rmSync(path.join(this.target, relPath));
          pruned.push(relPath);
        }
      }
    }

    for (const entry of manifest.files) {
      const dest = path.join(this.target, entry.path);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, this.store.readFile(id, entry.path));
    }

    // Verify the recovery. With prune, the target must match the snapshot
    // exactly; without it, newer files are intentionally kept, so we only
    // assert that every captured file was restored correctly.
    const after = this.verifyTarget(id, { exact: prune });
    if (!after.ok) {
      throw new Error(`Recovery verification failed for ${id}: ${after.errors.join('; ')}`);
    }

    return { id, fingerprint: manifest.fingerprint, restored: manifest.files.length, pruned };
  }

  /**
   * Recursively list files under a directory as target-relative POSIX paths,
   * skipping excluded top-level names.
   * @private
   */
  _walk(dir, base = dir, acc = []) {
    for (const name of fs.readdirSync(dir)) {
      const abs = path.join(dir, name);
      const rel = path.relative(base, abs);
      const top = rel.split(path.sep)[0];
      if (this.exclude.has(top)) continue;
      const stat = fs.statSync(abs);
      if (stat.isDirectory()) {
        this._walk(abs, base, acc);
      } else if (stat.isFile()) {
        acc.push(rel.split(path.sep).join('/'));
      }
    }
    return acc;
  }
}

module.exports = { PITR };
