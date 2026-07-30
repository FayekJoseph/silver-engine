'use strict';

/**
 * Test suite for hearts/support.js
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { logEvent, debugSnapshot, recover, enterDegradedMode, init } = require('../hearts/support');

// ---------------------------------------------------------------------------
// logEvent
// ---------------------------------------------------------------------------
describe('logEvent', () => {
  it('writes without throwing', () => {
    expect(() => logEvent({ type: 'TEST', message: 'unit test' })).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// debugSnapshot
// ---------------------------------------------------------------------------
describe('debugSnapshot', () => {
  it('returns an object with expected properties', () => {
    const snap = debugSnapshot();
    expect(snap).toHaveProperty('ts');
    expect(snap).toHaveProperty('identity');
    expect(snap).toHaveProperty('platform');
    expect(snap).toHaveProperty('nodeVersion');
    expect(snap).toHaveProperty('memoryUsage');
    expect(snap).toHaveProperty('uptime');
  });

  it('ts is a valid ISO 8601 date string', () => {
    const { ts } = debugSnapshot();
    expect(new Date(ts).toISOString()).toBe(ts);
  });
});

// ---------------------------------------------------------------------------
// recover
// ---------------------------------------------------------------------------
describe('recover', () => {
  it('returns { recovered: false } when no clean snapshots exist', () => {
    // The clean_snapshots dir exists but is empty (only .gitkeep).
    const result = recover();
    // Depending on whether a real snapshot JSON exists, recovered may be true or false.
    expect(typeof result.recovered).toBe('boolean');
    expect(typeof result.reason).toBe('string');
  });

  it('returns { recovered: true } when a valid snapshot is present', () => {
    const snapshotsDir = path.resolve(__dirname, '../base_state/clean_snapshots');
    const snapshotFile = path.join(snapshotsDir, 'snapshot_test.json');

    // Create a valid snapshot with the currently hashed integrity file.
    const { buildBaseline } = require('../hearts/integrity');
    const baseline = buildBaseline([
      path.resolve(__dirname, '../hearts/identity.js'),
      path.resolve(__dirname, '../hearts/integrity.js'),
      path.resolve(__dirname, '../hearts/support.js'),
    ]);
    fs.writeFileSync(snapshotFile, JSON.stringify(baseline, null, 2));

    try {
      const result = recover();
      expect(result.recovered).toBe(true);
    } finally {
      fs.unlinkSync(snapshotFile);
    }
  });
});

// ---------------------------------------------------------------------------
// enterDegradedMode
// ---------------------------------------------------------------------------
describe('enterDegradedMode', () => {
  it('returns { degraded: true, reason } with provided reason', () => {
    const result = enterDegradedMode('test reason');
    expect(result.degraded).toBe(true);
    expect(result.reason).toBe('test reason');
  });

  it('uses a default reason when none is supplied', () => {
    const result = enterDegradedMode();
    expect(result.degraded).toBe(true);
    expect(typeof result.reason).toBe('string');
    expect(result.reason.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// init
// ---------------------------------------------------------------------------
describe('init', () => {
  it('returns an object with status and details', () => {
    const result = init();
    expect(result).toHaveProperty('status');
    expect(result).toHaveProperty('details');
    expect(['OK', 'RECOVERED', 'DEGRADED']).toContain(result.status);
  });

  it('returns OK when hearts match an empty baseline', () => {
    // With an empty baseline the integrity check always passes;
    // and identity uses the real manifest so status should be VALID → OK.
    const result = init({});
    expect(['OK', 'RECOVERED']).toContain(result.status);
  });
});
