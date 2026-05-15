'use strict';

/**
 * Support Heart
 *
 * Provides recovery, debugging, and adaptation to ensure continuous operation
 * of the Silver Engine.
 * Responsibilities:
 *   - Attempt automatic recovery when the Identity or Integrity heart reports
 *     a failure.
 *   - Expose a structured debug snapshot of the engine's current runtime state.
 *   - Provide a graceful degraded-mode fallback so the engine can remain
 *     partially operational even when a critical check fails.
 */

const fs = require('fs');
const path = require('path');

const identity = require('./identity');
const integrity = require('./integrity');

const SNAPSHOTS_DIR = path.resolve(__dirname, '../base_state/clean_snapshots');
const LOG_DIR = path.resolve(__dirname, '../logs');
const SUPPORT_LOG = path.join(LOG_DIR, 'support.log');

/**
 * Append a structured event to the support log.
 *
 * @param {object} event
 */
function logEvent(event) {
  try {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }
    const line = JSON.stringify({ ts: new Date().toISOString(), ...event }) + '\n';
    fs.appendFileSync(SUPPORT_LOG, line, 'utf8');
  } catch (err) {
    console.error('[Support] Failed to write log:', err.message);
  }
}

/**
 * Return a debug snapshot of the current runtime state.
 *
 * @returns {object}
 */
function debugSnapshot() {
  const identityResult = identity.init();
  const snapshot = {
    ts: new Date().toISOString(),
    identity: identityResult,
    snapshotsDir: SNAPSHOTS_DIR,
    snapshotsDirExists: fs.existsSync(SNAPSHOTS_DIR),
    platform: process.platform,
    nodeVersion: process.version,
    memoryUsage: process.memoryUsage(),
    uptime: process.uptime(),
  };
  logEvent({ type: 'DEBUG_SNAPSHOT', ...snapshot });
  return snapshot;
}

/**
 * Attempt to restore the engine to a known-good state using the latest clean
 * snapshot stored in base_state/clean_snapshots/.
 *
 * The function looks for a JSON file whose name sorts last (most recent) in
 * the snapshots directory, reads the baseline hashes it contains, and re-runs
 * integrity validation against those hashes.
 *
 * @returns {{ recovered: boolean, reason: string }}
 */
function recover() {
  if (!fs.existsSync(SNAPSHOTS_DIR)) {
    const reason = 'clean_snapshots directory does not exist – cannot recover';
    logEvent({ type: 'RECOVERY_FAILED', reason });
    console.warn(`[Support] ${reason}`);
    return { recovered: false, reason };
  }

  const files = fs
    .readdirSync(SNAPSHOTS_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort();

  if (files.length === 0) {
    const reason = 'no clean snapshots found – cannot recover';
    logEvent({ type: 'RECOVERY_FAILED', reason });
    console.warn(`[Support] ${reason}`);
    return { recovered: false, reason };
  }

  const latest = path.join(SNAPSHOTS_DIR, files[files.length - 1]);
  let baseline;
  try {
    baseline = JSON.parse(fs.readFileSync(latest, 'utf8'));
  } catch (err) {
    const reason = `failed to parse snapshot ${latest}: ${err.message}`;
    logEvent({ type: 'RECOVERY_FAILED', reason });
    console.error(`[Support] ${reason}`);
    return { recovered: false, reason };
  }

  const { ok, violations } = integrity.validateFiles(baseline);
  if (ok) {
    const reason = `integrity validated using snapshot ${path.basename(latest)}`;
    logEvent({ type: 'RECOVERY_OK', snapshot: path.basename(latest) });
    console.log(`[Support] Recovery successful – ${reason}`);
    return { recovered: true, reason };
  }

  const reason = `recovery attempted but ${violations.length} violation(s) remain`;
  logEvent({ type: 'RECOVERY_PARTIAL', violations, snapshot: path.basename(latest) });
  console.warn(`[Support] ${reason}`);
  return { recovered: false, reason };
}

/**
 * Enter a safe degraded operating mode.
 * In degraded mode the engine logs all errors, disables non-essential
 * features, and continues to serve requests with reduced functionality.
 *
 * @param {string} [reason]
 * @returns {{ degraded: boolean, reason: string }}
 */
function enterDegradedMode(reason) {
  const msg = reason || 'unspecified failure';
  logEvent({ type: 'DEGRADED_MODE', reason: msg });
  console.warn(`[Support] Entering degraded mode – ${msg}`);
  return { degraded: true, reason: msg };
}

/**
 * Initialise the Support Heart.
 * Runs identity + integrity checks and triggers recovery or degraded mode if
 * any heart reports a failure.
 *
 * @param {Record<string, string>} [integrityBaseline]
 * @returns {{ status: string, details: object }}
 */
function init(integrityBaseline) {
  logEvent({ type: 'INIT_START' });

  const identityResult = identity.init();
  const integrityResult = integrity.init(integrityBaseline);

  if (identityResult.status === 'VALID' && integrityResult.ok) {
    logEvent({ type: 'INIT_OK' });
    console.log('[Support] All hearts healthy.');
    return { status: 'OK', details: { identity: identityResult, integrity: integrityResult } };
  }

  // Attempt automatic recovery first.
  const recoveryResult = recover();
  if (recoveryResult.recovered) {
    logEvent({ type: 'INIT_RECOVERED' });
    return {
      status: 'RECOVERED',
      details: { identity: identityResult, integrity: integrityResult, recovery: recoveryResult },
    };
  }

  // Fall back to degraded mode.
  const degraded = enterDegradedMode('heart check(s) failed and recovery was unsuccessful');
  return {
    status: 'DEGRADED',
    details: { identity: identityResult, integrity: integrityResult, recovery: recoveryResult, degraded },
  };
}

module.exports = { logEvent, debugSnapshot, recover, enterDegradedMode, init };
