'use strict';

const { sign, verify, generateKey } = require('../src/pitr/signing');

describe('signing (The Diode)', () => {
  const key = 'a'.repeat(64);

  test('sign -> verify round-trip returns true', () => {
    const message = 'snapshot-fingerprint-deadbeef';
    const signature = sign(message, key);
    expect(verify(message, signature, key)).toBe(true);
  });

  test('a tampered message fails verification', () => {
    const message = 'snapshot-fingerprint-deadbeef';
    const signature = sign(message, key);
    expect(verify('snapshot-fingerprint-deadbee0', signature, key)).toBe(false);
  });

  test('the wrong key fails verification', () => {
    const message = 'snapshot-fingerprint-deadbeef';
    const signature = sign(message, key);
    expect(verify(message, signature, 'b'.repeat(64))).toBe(false);
  });

  test('a malformed/short signature returns false (does not throw)', () => {
    const message = 'snapshot-fingerprint-deadbeef';
    expect(() => verify(message, 'abcd', key)).not.toThrow();
    expect(verify(message, 'abcd', key)).toBe(false);
    expect(verify(message, 'not-hex-zz', key)).toBe(false);
    expect(verify(message, '', key)).toBe(false);
  });

  test('generateKey returns 64 hex chars and two calls differ', () => {
    const k1 = generateKey();
    const k2 = generateKey();
    expect(k1).toMatch(/^[0-9a-f]{64}$/);
    expect(k2).toMatch(/^[0-9a-f]{64}$/);
    expect(k1).not.toBe(k2);
  });

  test('sign accepts Buffer message and key', () => {
    const message = Buffer.from('binary-state');
    const keyBuf = Buffer.from(key, 'hex');
    const signature = sign(message, keyBuf);
    expect(signature).toMatch(/^[0-9a-f]{64}$/);
    expect(verify(message, signature, keyBuf)).toBe(true);
  });
});
