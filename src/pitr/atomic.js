'use strict';

// All-or-nothing file operations for the PITR tool — "The Clutch".
//
// A recovery must never half-complete. The transaction here captures the
// original bytes (or absence) of every affected path *before* applying any
// change. If a single staged operation fails, every path that was already
// touched is restored to its captured state, so the on-disk tree returns to
// exactly where it started.

const fs = require('fs');
const path = require('path');

/**
 * Write `buffer` to `absPath` atomically.
 *
 * The bytes land in a temp file in the SAME directory first, then a single
 * `fs.renameSync` swaps it into place. Rename is atomic within one filesystem,
 * so a reader never observes a partially written file. Parent directories are
 * created as needed.
 *
 * @param {string} absPath absolute destination path
 * @param {Buffer} buffer contents to write
 */
function atomicWrite(absPath, buffer) {
  const dir = path.dirname(absPath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(
    dir,
    `.${path.basename(absPath)}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`
  );
  try {
    fs.writeFileSync(tmp, buffer);
    fs.renameSync(tmp, absPath);
  } catch (err) {
    try {
      fs.rmSync(tmp, { force: true });
    } catch (_) {
      // best-effort temp cleanup; surface the original error below
    }
    throw err;
  }
}

/**
 * Begin a staged, all-or-nothing batch of file operations under `targetDir`.
 *
 * All paths passed to the returned methods are relative to `targetDir` and are
 * resolved with `path.join`. Nothing touches disk until `commit()`.
 *
 * @param {string} targetDir absolute or relative directory the batch operates in
 * @returns {{
 *   set: (relPath: string, buffer: Buffer) => void,
 *   remove: (relPath: string) => void,
 *   commit: () => { written: string[], removed: string[] },
 *   rollback: () => void
 * }}
 */
function beginTransaction(targetDir) {
  const root = path.resolve(targetDir);
  /** @type {Array<{type: 'set'|'remove', relPath: string, buffer?: Buffer}>} */
  const ops = [];

  /**
   * Stage a file write.
   * @param {string} relPath path relative to targetDir
   * @param {Buffer} buffer contents to write
   */
  function set(relPath, buffer) {
    ops.push({ type: 'set', relPath, buffer });
  }

  /**
   * Stage a file deletion.
   * @param {string} relPath path relative to targetDir
   */
  function remove(relPath) {
    ops.push({ type: 'remove', relPath });
  }

  /**
   * Apply every staged op as a unit.
   *
   * Before applying, the original bytes (or absence) of every affected path are
   * captured. Ops are then applied in order. If any op throws, every path that
   * was already applied is rolled back to its captured original state and the
   * error is rethrown — leaving the tree exactly as it was before commit.
   *
   * @returns {{ written: string[], removed: string[] }}
   */
  function commit() {
    // Capture original state of every affected path, de-duplicated.
    /** @type {Map<string, {existed: boolean, content: Buffer|null}>} */
    const originals = new Map();
    for (const op of ops) {
      const abs = path.join(root, op.relPath);
      if (originals.has(abs)) continue;
      if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
        originals.set(abs, { existed: true, content: fs.readFileSync(abs) });
      } else {
        originals.set(abs, { existed: false, content: null });
      }
    }

    /** @type {string[]} */
    const appliedPaths = [];
    const written = [];
    const removed = [];

    try {
      for (const op of ops) {
        const abs = path.join(root, op.relPath);
        if (op.type === 'set') {
          atomicWrite(abs, op.buffer);
          appliedPaths.push(abs);
          written.push(op.relPath);
        } else {
          fs.rmSync(abs, { force: true });
          appliedPaths.push(abs);
          removed.push(op.relPath);
        }
      }
    } catch (err) {
      // Roll back every path we already touched to its captured original.
      for (const abs of appliedPaths) {
        const original = originals.get(abs);
        try {
          if (original.existed) {
            atomicWrite(abs, original.content);
          } else {
            fs.rmSync(abs, { force: true });
          }
        } catch (_) {
          // best-effort restore; the original error is still rethrown
        }
      }
      throw err;
    }

    return { written, removed };
  }

  /** Discard all staged ops without touching disk. */
  function rollback() {
    ops.length = 0;
  }

  return { set, remove, commit, rollback };
}

module.exports = { atomicWrite, beginTransaction };
