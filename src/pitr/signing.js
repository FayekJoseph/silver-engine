'use strict';

// The Diode: a cryptographic root of trust for PITR snapshots.
//
// A fingerprint proves a snapshot is internally consistent, but it is
// self-referential — anyone who can rewrite the state can rewrite its
// fingerprint. Signing closes that loop. By stamping a fingerprint with an
// HMAC-SHA256 under an external device key, integrity becomes trustable against
// a secret the attacker does not hold, not against the data itself. Trust flows
// one way, from the key into the snapshot — hence the diode.

const crypto = require('crypto');

const HMAC_ALGORITHM = 'sha256';

/**
 * Sign a message with HMAC-SHA256 under the given key.
 * @param {Buffer|string} message
 * @param {Buffer|string} key
 * @returns {string} lowercase hex HMAC digest
 */
function sign(message, key) {
  return crypto.createHmac(HMAC_ALGORITHM, key).update(message).digest('hex');
}

/**
 * Verify a signature against a message using a constant-time comparison.
 *
 * The comparison runs in constant time to avoid leaking how many leading bytes
 * matched. A length mismatch would make timingSafeEqual throw, so we guard for
 * it and treat any malformed signature as simply invalid.
 *
 * @param {Buffer|string} message
 * @param {string} signature lowercase hex HMAC digest to check
 * @param {Buffer|string} key
 * @returns {boolean} true if the signature is valid
 */
function verify(message, signature, key) {
  const expected = Buffer.from(sign(message, key), 'hex');
  let actual;
  try {
    actual = Buffer.from(String(signature), 'hex');
  } catch (err) {
    return false;
  }
  // timingSafeEqual throws on length mismatch; bail out first so it never does.
  if (actual.length !== expected.length) {
    return false;
  }
  return crypto.timingSafeEqual(actual, expected);
}

/**
 * Generate a fresh random 32-byte device key.
 * @returns {string} 64-character lowercase hex string
 */
function generateKey() {
  return crypto.randomBytes(32).toString('hex');
}

module.exports = { HMAC_ALGORITHM, sign, verify, generateKey };
