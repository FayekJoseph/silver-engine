'use strict';

// Cryptographic helpers shared by the PITR tool.
//
// The Silver Engine's Identity heart is built on a single idea: every piece of
// state has a deterministic cryptographic fingerprint. Point-In-Time Recovery
// relies on that fingerprint to prove a restored state is *exactly* the state
// that was captured — nothing added, removed, or altered.

const crypto = require('crypto');

const HASH_ALGORITHM = 'sha256';

/**
 * Hash a buffer or string with SHA-256.
 * @param {Buffer|string} data
 * @returns {string} lowercase hex digest
 */
function hash(data) {
  return crypto.createHash(HASH_ALGORITHM).update(data).digest('hex');
}

/**
 * Compute the fingerprint of a snapshot from its file entries.
 *
 * The fingerprint is the SHA-256 of a canonical, order-independent encoding of
 * every file's path and content hash. Two states produce the same fingerprint
 * if and only if they contain the same files with the same contents, which is
 * what makes verification meaningful.
 *
 * @param {Array<{path: string, sha256: string}>} files
 * @returns {string} lowercase hex digest
 */
function fingerprintFiles(files) {
  const canonical = files
    .map((f) => `${f.path}:${f.sha256}`)
    .sort()
    .join('\n');
  return hash(canonical);
}

module.exports = { HASH_ALGORITHM, hash, fingerprintFiles };
