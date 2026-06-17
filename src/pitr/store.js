'use strict';

// Snapshot storage for the PITR tool.
//
// Snapshots live under a store root (default `.pitr/`) and are immutable once
// written. Layout:
//
//   <root>/
//     snapshots/
//       <snapshotId>/
//         manifest.json     # metadata + per-file hashes + fingerprint
//         files/<path>      # captured file contents, mirroring the target tree

const fs = require('fs');
const path = require('path');

class SnapshotStore {
  /**
   * @param {string} root absolute or relative path to the store directory
   */
  constructor(root) {
    this.root = path.resolve(root);
    this.snapshotsDir = path.join(this.root, 'snapshots');
  }

  /** Ensure the store directory tree exists. */
  init() {
    fs.mkdirSync(this.snapshotsDir, { recursive: true });
  }

  /** @param {string} id */
  snapshotDir(id) {
    return path.join(this.snapshotsDir, id);
  }

  /** @param {string} id */
  manifestPath(id) {
    return path.join(this.snapshotDir(id), 'manifest.json');
  }

  /** @param {string} id */
  filesDir(id) {
    return path.join(this.snapshotDir(id), 'files');
  }

  /** @param {string} id */
  exists(id) {
    return fs.existsSync(this.manifestPath(id));
  }

  /** @returns {string[]} snapshot ids sorted oldest-to-newest by creation time */
  list() {
    if (!fs.existsSync(this.snapshotsDir)) return [];
    return fs
      .readdirSync(this.snapshotsDir)
      .filter((id) => this.exists(id))
      .map((id) => this.readManifest(id))
      .sort((a, b) => a.seq - b.seq || a.createdAt.localeCompare(b.createdAt))
      .map((m) => m.id);
  }

  /**
   * Persist a snapshot's manifest and captured file contents.
   * @param {object} manifest
   * @param {Map<string, Buffer>} contents keyed by relative path
   */
  write(manifest, contents) {
    const dir = this.snapshotDir(manifest.id);
    if (fs.existsSync(dir)) {
      throw new Error(`Snapshot already exists: ${manifest.id}`);
    }
    const filesDir = this.filesDir(manifest.id);
    for (const [relPath, buffer] of contents) {
      const dest = path.join(filesDir, relPath);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, buffer);
    }
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(this.manifestPath(manifest.id), JSON.stringify(manifest, null, 2));
  }

  /**
   * @param {string} id
   * @returns {object} parsed manifest
   */
  readManifest(id) {
    if (!this.exists(id)) {
      throw new Error(`Snapshot not found: ${id}`);
    }
    return JSON.parse(fs.readFileSync(this.manifestPath(id), 'utf8'));
  }

  /**
   * Read the stored content of a single file in a snapshot.
   * @param {string} id
   * @param {string} relPath
   * @returns {Buffer}
   */
  readFile(id, relPath) {
    return fs.readFileSync(path.join(this.filesDir(id), relPath));
  }
}

module.exports = { SnapshotStore };
