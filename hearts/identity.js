// Identity Heart
// This component is responsible for generating and validating the
// cryptographic identity of the Silver Engine.
//
// It uses an Ed25519 key pair as the engine's unique cryptographic
// fingerprint. The public key acts as the engine's identity; the private
// key is used to sign payloads so that other components (and external
// parties) can verify that a message genuinely originates from this engine.

'use strict';

const crypto = require('crypto');

/**
 * Generate a new cryptographic identity for the engine.
 *
 * @returns {{ publicKey: string, privateKey: string, fingerprint: string }}
 *   PEM-encoded key pair plus a short, stable fingerprint derived from the
 *   public key (a SHA-256 hash, hex-encoded).
 */
function generateIdentity() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  return {
    publicKey,
    privateKey,
    fingerprint: fingerprintOf(publicKey),
  };
}

/**
 * Derive a stable fingerprint from a PEM-encoded public key.
 *
 * @param {string} publicKey - PEM-encoded SPKI public key.
 * @returns {string} Hex-encoded SHA-256 digest of the key.
 */
function fingerprintOf(publicKey) {
  if (typeof publicKey !== 'string' || publicKey.length === 0) {
    throw new TypeError('publicKey must be a non-empty PEM string');
  }
  return crypto.createHash('sha256').update(publicKey).digest('hex');
}

/**
 * Sign a payload with the engine's private key.
 *
 * @param {string|Buffer} payload - The data to sign.
 * @param {string} privateKey - PEM-encoded PKCS8 private key.
 * @returns {string} Base64-encoded Ed25519 signature.
 */
function sign(payload, privateKey) {
  const data = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload));
  // Ed25519 does not use a separate hashing step, so the algorithm is null.
  return crypto.sign(null, data, privateKey).toString('base64');
}

/**
 * Validate that a signature was produced for the given payload by the
 * holder of the private key matching the supplied public key.
 *
 * @param {string|Buffer} payload - The data that was signed.
 * @param {string} signature - Base64-encoded signature from `sign`.
 * @param {string} publicKey - PEM-encoded SPKI public key.
 * @returns {boolean} True if the signature is valid, false otherwise.
 */
function verify(payload, signature, publicKey) {
  const data = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload));
  try {
    return crypto.verify(
      null,
      data,
      publicKey,
      Buffer.from(signature, 'base64')
    );
  } catch (_err) {
    // Malformed key/signature inputs are treated as a failed validation
    // rather than a thrown error so callers can branch on a boolean.
    return false;
  }
}

module.exports = {
  generateIdentity,
  fingerprintOf,
  sign,
  verify,
};

// When run directly, demonstrate the identity lifecycle.
if (require.main === module) {
  console.log('Identity Heart - Initialization...');

  const identity = generateIdentity();
  console.log(`Generated identity fingerprint: ${identity.fingerprint}`);

  const message = 'silver-engine-handshake';
  const signature = sign(message, identity.privateKey);
  const valid = verify(message, signature, identity.publicKey);
  const tampered = verify('tampered-message', signature, identity.publicKey);

  console.log(`Signature valid for original message: ${valid}`);
  console.log(`Signature valid for tampered message: ${tampered}`);
}
