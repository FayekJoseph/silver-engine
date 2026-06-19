'use strict';

// The Backward Chain — a tamper-evident hash chain over snapshot fingerprints.
//
// Each snapshot's fingerprint is linked to the one before it the way a
// blockchain links blocks: every link is a hash of the current fingerprint
// concatenated with the previous link. Because the previous link is itself a
// hash of everything that came before it, the final link transitively commits
// to the *entire* timeline. Altering any past fingerprint — or reordering the
// snapshots — changes every link that follows, so the whole history can be
// verified backward, end to end, and any tampering becomes detectable.

const crypto = require('crypto');

const HASH_ALGORITHM = 'sha256';

/**
 * Compute the chain link for a fingerprint given the previous link.
 *
 * The link is the SHA-256 of `fingerprint` concatenated with `prevLink`. The
 * genesis snapshot has no predecessor, so a null or empty `prevLink` is treated
 * as the empty string. The result is deterministic: identical inputs always
 * yield the identical link.
 *
 * @param {string} fingerprint lowercase hex fingerprint of the snapshot
 * @param {string|null} prevLink previous entry's link, or null/'' for genesis
 * @returns {string} lowercase hex SHA-256 digest of the link
 */
function linkFingerprint(fingerprint, prevLink) {
  const prev = prevLink || '';
  return crypto
    .createHash(HASH_ALGORITHM)
    .update(fingerprint + prev)
    .digest('hex');
}

/**
 * Build a backward chain from an ordered array of fingerprints.
 *
 * The fingerprints must be supplied oldest-first. Each resulting entry records
 * the fingerprint, the previous entry's link (`null` for the genesis entry),
 * and its own link computed via {@link linkFingerprint}.
 *
 * @param {Array<string>} fingerprints ordered (oldest-first) hex fingerprints
 * @returns {Array<{fingerprint: string, prev: (string|null), link: string}>}
 */
function buildChain(fingerprints) {
  const entries = [];
  let prev = null;
  for (const fingerprint of fingerprints) {
    const link = linkFingerprint(fingerprint, prev || '');
    entries.push({ fingerprint, prev, link });
    prev = link;
  }
  return entries;
}

/**
 * Verify a backward chain end to end.
 *
 * Two invariants are checked for every entry, in order:
 *   (a) the entry's `link` equals linkFingerprint(fingerprint, prev || ''); and
 *   (b) the entry's `prev` equals the previous entry's `link` (the genesis
 *       entry's `prev` must be null or '').
 * A violation of either invariant means a fingerprint was altered or the
 * snapshots were reordered, which breaks the chain.
 *
 * @param {Array<{fingerprint: string, prev: (string|null), link: string}>} entries
 * @returns {{ok: boolean, errors: Array<string>}}
 */
function verifyChain(entries) {
  const errors = [];
  let prevLink = null;

  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];

    const expectedLink = linkFingerprint(entry.fingerprint, entry.prev || '');
    if (entry.link !== expectedLink) {
      errors.push(
        `entry ${i}: link does not match fingerprint (expected ${expectedLink}, got ${entry.link})`
      );
    }

    if (i === 0) {
      if (entry.prev !== null && entry.prev !== '') {
        errors.push(
          `entry ${i}: genesis prev must be null or '' (got ${entry.prev})`
        );
      }
    } else if (entry.prev !== prevLink) {
      errors.push(
        `entry ${i}: prev does not match previous entry's link (expected ${prevLink}, got ${entry.prev})`
      );
    }

    prevLink = entry.link;
  }

  return { ok: errors.length === 0, errors };
}

module.exports = { HASH_ALGORITHM, linkFingerprint, buildChain, verifyChain };
