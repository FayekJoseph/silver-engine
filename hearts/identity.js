'use strict';

/**
 * Identity Heart
 *
 * Protects and validates the Silver Engine's unique cryptographic fingerprint.
 * Responsibilities:
 *   - Generate a deterministic fingerprint from the engine's base-state manifest.
 *   - Validate the current runtime fingerprint against the stored reference.
 *   - Expose helpers used by the Integrity and Support hearts.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const MANIFEST_PATH = path.resolve(__dirname, '../base_state/identity_manifest.json');

/**
 * Compute a SHA-256 hash of the given data string.
 * @param {string} data
 * @returns {string} hex digest
 */
function hashData(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Load the identity manifest from disk.
 * Returns null when the manifest does not exist.
 * @returns {object|null}
 */
function loadManifest() {
  try {
    const raw = fs.readFileSync(MANIFEST_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Generate a cryptographic fingerprint from the provided engine descriptor.
 * The descriptor is an object whose keys are sorted before hashing so that
 * the result is deterministic regardless of insertion order.
 *
 * @param {object} descriptor – arbitrary key/value metadata about the engine
 * @returns {string} hex fingerprint
 */
function generateFingerprint(descriptor) {
  if (!descriptor || typeof descriptor !== 'object') {
    throw new TypeError('descriptor must be a non-null object');
  }
  const sorted = JSON.stringify(descriptor, Object.keys(descriptor).sort());
  return hashData(sorted);
}

/**
 * Validate a runtime fingerprint against the reference stored in the manifest.
 *
 * @param {string} runtimeFingerprint
 * @returns {{ valid: boolean, reason: string }}
 */
function validateFingerprint(runtimeFingerprint) {
  const manifest = loadManifest();
  if (!manifest) {
    return { valid: false, reason: 'identity manifest not found' };
  }
  if (!manifest.fingerprint) {
    return { valid: false, reason: 'manifest does not contain a fingerprint' };
  }
  const valid = manifest.fingerprint === runtimeFingerprint;
  return {
    valid,
    reason: valid ? 'fingerprint matches manifest' : 'fingerprint mismatch detected',
  };
}

/**
 * Initialise the Identity Heart.
 * Logs the result of the startup fingerprint check.
 *
 * @param {object} [descriptor] – optional descriptor; defaults to manifest's descriptor
 * @returns {{ fingerprint: string, status: string }}
 */
function init(descriptor) {
  const manifest = loadManifest();
  const desc = descriptor || (manifest && manifest.descriptor) || { engine: 'silver-engine', version: '1.0.0' };
  const fingerprint = generateFingerprint(desc);
  const { valid, reason } = validateFingerprint(fingerprint);

  const status = valid ? 'VALID' : 'UNVERIFIED';
  console.log(`[Identity] status=${status} reason="${reason}" fingerprint=${fingerprint.slice(0, 12)}…`);

  return { fingerprint, status };
}

module.exports = { hashData, loadManifest, generateFingerprint, validateFingerprint, init };