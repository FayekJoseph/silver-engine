'use strict';

/**
 * Test suite for hearts/integrity.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { hashFile, logEvent, validateFiles, buildBaseline, init } = require('../hearts/integrity');

// ---------------------------------------------------------------------------
// hashFile
// ---------------------------------------------------------------------------
describe('hashFile', () => {
  it('returns a 64-character hex digest for a readable file', () => {
    const tmp = path.join(os.tmpdir(), `hash-test-${Date.now()}.txt`);
    fs.writeFileSync(tmp, 'hello integrity');
    try {
      const result = hashFile(tmp);
      expect(result).toHaveLength(64);
      expect(result).toMatch(/^[0-9a-f]+$/);
    } finally {
      fs.unlinkSync(tmp);
    }
  });

  it('returns null for a file that does not exist', () => {
    expect(hashFile('/non/existent/file.js')).toBeNull();
  });

  it('returns different hashes for files with different content', () => {
    const tmp1 = path.join(os.tmpdir(), `hash-a-${Date.now()}.txt`);
    const tmp2 = path.join(os.tmpdir(), `hash-b-${Date.now()}.txt`);
    fs.writeFileSync(tmp1, 'content A');
    fs.writeFileSync(tmp2, 'content B');
    try {
      expect(hashFile(tmp1)).not.toBe(hashFile(tmp2));
    } finally {
      fs.unlinkSync(tmp1);
      fs.unlinkSync(tmp2);
    }
  });
});

// ---------------------------------------------------------------------------
// validateFiles
// ---------------------------------------------------------------------------
describe('validateFiles', () => {
  it('returns { ok: true, violations: [] } for an empty baseline', () => {
    const result = validateFiles({});
    expect(result.ok).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it('returns { ok: true } when all file hashes match', () => {
    const tmp = path.join(os.tmpdir(), `valid-${Date.now()}.txt`);
    fs.writeFileSync(tmp, 'known content');
    const hash = hashFile(tmp);
    try {
      const result = validateFiles({ [tmp]: hash });
      expect(result.ok).toBe(true);
      expect(result.violations).toHaveLength(0);
    } finally {
      fs.unlinkSync(tmp);
    }
  });

  it('reports a violation when a file hash does not match', () => {
    const tmp = path.join(os.tmpdir(), `tampered-${Date.now()}.txt`);
    fs.writeFileSync(tmp, 'original content');
    try {
      const result = validateFiles({ [tmp]: '0'.repeat(64) });
      expect(result.ok).toBe(false);
      expect(result.violations).toContain(tmp);
    } finally {
      fs.unlinkSync(tmp);
    }
  });

  it('reports a violation for a missing file', () => {
    const missing = '/tmp/does-not-exist-ever.js';
    const result = validateFiles({ [missing]: 'a'.repeat(64) });
    expect(result.ok).toBe(false);
    expect(result.violations).toContain(missing);
  });

  it('throws a TypeError when passed a non-object baseline', () => {
    expect(() => validateFiles(null)).toThrow(TypeError);
    expect(() => validateFiles('bad')).toThrow(TypeError);
  });
});

// ---------------------------------------------------------------------------
// buildBaseline
// ---------------------------------------------------------------------------
describe('buildBaseline', () => {
  it('builds a baseline containing hashes for existing files', () => {
    const tmp = path.join(os.tmpdir(), `baseline-${Date.now()}.txt`);
    fs.writeFileSync(tmp, 'baseline content');
    try {
      const baseline = buildBaseline([tmp]);
      expect(baseline[tmp]).toBeDefined();
      expect(baseline[tmp]).toHaveLength(64);
    } finally {
      fs.unlinkSync(tmp);
    }
  });

  it('omits files that cannot be read', () => {
    const baseline = buildBaseline(['/tmp/non-existent-file.js']);
    expect(baseline).not.toHaveProperty('/tmp/non-existent-file.js');
  });
});

// ---------------------------------------------------------------------------
// logEvent
// ---------------------------------------------------------------------------
describe('logEvent', () => {
  it('writes a JSON line to the integrity log without throwing', () => {
    expect(() => logEvent({ type: 'TEST_EVENT', detail: 'unit test' })).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// init
// ---------------------------------------------------------------------------
describe('init', () => {
  it('returns { ok: true } when baseline is empty', () => {
    const result = init({});
    expect(result.ok).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it('returns { ok: true } when all files in baseline match', () => {
    const tmp = path.join(os.tmpdir(), `init-test-${Date.now()}.txt`);
    fs.writeFileSync(tmp, 'init content');
    const baseline = buildBaseline([tmp]);
    try {
      const result = init(baseline);
      expect(result.ok).toBe(true);
    } finally {
      fs.unlinkSync(tmp);
    }
  });
});
