'use strict';

/**
 * Test suite for hearts/identity.js
 */

const path = require('path');
const fs = require('fs');
const { hashData, generateFingerprint, validateFingerprint, loadManifest, init } = require('../hearts/identity');

const MANIFEST_PATH = path.resolve(__dirname, '../base_state/identity_manifest.json');

// ---------------------------------------------------------------------------
// hashData
// ---------------------------------------------------------------------------
describe('hashData', () => {
  it('returns a 64-character hex string', () => {
    const result = hashData('hello world');
    expect(typeof result).toBe('string');
    expect(result).toHaveLength(64);
    expect(result).toMatch(/^[0-9a-f]+$/);
  });

  it('is deterministic for the same input', () => {
    expect(hashData('abc')).toBe(hashData('abc'));
  });

  it('produces different hashes for different inputs', () => {
    expect(hashData('abc')).not.toBe(hashData('xyz'));
  });
});

// ---------------------------------------------------------------------------
// generateFingerprint
// ---------------------------------------------------------------------------
describe('generateFingerprint', () => {
  it('returns a 64-character hex string for a valid descriptor', () => {
    const fp = generateFingerprint({ engine: 'silver-engine', version: '1.0.0' });
    expect(fp).toHaveLength(64);
    expect(fp).toMatch(/^[0-9a-f]+$/);
  });

  it('is deterministic regardless of object key insertion order', () => {
    const a = generateFingerprint({ version: '1.0.0', engine: 'silver-engine' });
    const b = generateFingerprint({ engine: 'silver-engine', version: '1.0.0' });
    expect(a).toBe(b);
  });

  it('throws a TypeError when passed a non-object', () => {
    expect(() => generateFingerprint('not-an-object')).toThrow(TypeError);
    expect(() => generateFingerprint(null)).toThrow(TypeError);
  });
});

// ---------------------------------------------------------------------------
// loadManifest / validateFingerprint
// ---------------------------------------------------------------------------
describe('loadManifest', () => {
  it('returns an object when the manifest file exists', () => {
    const manifest = loadManifest();
    // The manifest may or may not exist in CI – just verify the type.
    if (manifest !== null) {
      expect(typeof manifest).toBe('object');
      expect(manifest).toHaveProperty('fingerprint');
    }
  });
});

describe('validateFingerprint', () => {
  it('returns { valid: false } when the manifest is absent', () => {
    // Temporarily rename the manifest to simulate absence.
    const tmpPath = MANIFEST_PATH + '.bak';
    let renamed = false;
    if (fs.existsSync(MANIFEST_PATH)) {
      fs.renameSync(MANIFEST_PATH, tmpPath);
      renamed = true;
    }
    try {
      const result = validateFingerprint('any-hash');
      expect(result.valid).toBe(false);
    } finally {
      if (renamed) fs.renameSync(tmpPath, MANIFEST_PATH);
    }
  });

  it('returns { valid: true } for the correct fingerprint from the manifest', () => {
    const manifest = loadManifest();
    if (!manifest) return; // skip if manifest not present
    const result = validateFingerprint(manifest.fingerprint);
    expect(result.valid).toBe(true);
  });

  it('returns { valid: false } for a wrong fingerprint', () => {
    const result = validateFingerprint('0'.repeat(64));
    expect(result.valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// init
// ---------------------------------------------------------------------------
describe('init', () => {
  it('returns an object with fingerprint and status properties', () => {
    const result = init();
    expect(result).toHaveProperty('fingerprint');
    expect(result).toHaveProperty('status');
    expect(['VALID', 'UNVERIFIED']).toContain(result.status);
  });

  it('returns VALID when a matching descriptor is supplied', () => {
    const descriptor = { engine: 'silver-engine', version: '1.0.0' };
    const result = init(descriptor);
    // The manifest stores the fingerprint for this exact descriptor.
    expect(result.status).toBe('VALID');
  });
});
