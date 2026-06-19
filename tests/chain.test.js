'use strict';

const { linkFingerprint, buildChain, verifyChain } = require('../src/pitr/chain');

// A few stable, fake fingerprints (content of these strings does not matter for
// the chain logic — only that they are distinct and deterministic).
const FPS = [
  'a'.repeat(64),
  'b'.repeat(64),
  'c'.repeat(64),
  'd'.repeat(64),
];

describe('linkFingerprint', () => {
  test('is deterministic for identical inputs', () => {
    expect(linkFingerprint('fp', 'prev')).toBe(linkFingerprint('fp', 'prev'));
  });

  test('treats null and empty prev as equivalent (genesis)', () => {
    expect(linkFingerprint('fp', null)).toBe(linkFingerprint('fp', ''));
  });

  test('returns lowercase hex sha256 (64 chars)', () => {
    const link = linkFingerprint('fp', '');
    expect(link).toMatch(/^[0-9a-f]{64}$/);
  });

  test('changes when the fingerprint changes', () => {
    expect(linkFingerprint('fp1', 'prev')).not.toBe(linkFingerprint('fp2', 'prev'));
  });

  test('changes when the prev link changes', () => {
    expect(linkFingerprint('fp', 'prev1')).not.toBe(linkFingerprint('fp', 'prev2'));
  });
});

describe('buildChain', () => {
  test('genesis entry has prev null and a correct link', () => {
    const chain = buildChain(FPS);
    expect(chain[0].prev).toBeNull();
    expect(chain[0].link).toBe(linkFingerprint(FPS[0], ''));
  });

  test('each entry chains prev to the previous entry link', () => {
    const chain = buildChain(FPS);
    for (let i = 1; i < chain.length; i += 1) {
      expect(chain[i].prev).toBe(chain[i - 1].link);
      expect(chain[i].link).toBe(linkFingerprint(chain[i].fingerprint, chain[i].prev));
    }
  });

  test('produces a chain that verifyChain accepts', () => {
    const result = verifyChain(buildChain(FPS));
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });
});

describe('verifyChain', () => {
  test('a single-element genesis-only chain verifies ok', () => {
    const result = verifyChain(buildChain([FPS[0]]));
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test('tampering with a middle fingerprint fails and names the index', () => {
    const chain = buildChain(FPS);
    chain[1].fingerprint = 'f'.repeat(64); // alter without recomputing link
    const result = verifyChain(chain);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('entry 1'))).toBe(true);
  });

  test('breaking a prev linkage is detected', () => {
    const chain = buildChain(FPS);
    chain[2].prev = 'deadbeef'; // sever the backward link
    const result = verifyChain(chain);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('entry 2'))).toBe(true);
  });

  test('reordering entries is detected', () => {
    const chain = buildChain(FPS);
    const tmp = chain[1];
    chain[1] = chain[2];
    chain[2] = tmp;
    const result = verifyChain(chain);
    expect(result.ok).toBe(false);
  });

  test('a non-null/non-empty genesis prev is rejected', () => {
    const chain = buildChain(FPS);
    chain[0].prev = 'deadbeef';
    const result = verifyChain(chain);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('entry 0'))).toBe(true);
  });
});
