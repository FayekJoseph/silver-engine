'use strict';

/**
 * Integrity Heart
 *
 * Ensures runtime code validation and protects the Silver Engine from
 * unauthorized changes or tampering.
 * Responsibilities:
 *   - Compute SHA-256 hashes of critical source files at startup.
 *   - Compare live hashes against a set of known-good baseline hashes.
 *   - Append tamper events to the integrity log for later analysis.
 *   - Expose a validateFiles() helper consumed by the Support heart.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const LOG_DIR = path.resolve(__dirname, '../logs');
const LOG_FILE = path.join(LOG_DIR, 'integrity.log');

/**
 * Compute the SHA-256 hash of a file's current contents.
 * Returns null when the file cannot be read.
 *
 * @param {string} filePath – absolute or relative path
 * @returns {string|null} hex digest
 */
function hashFile(filePath) {
  try {
    const content = fs.readFileSync(filePath);
    return crypto.createHash('sha256').update(content).digest('hex');
  } catch {
    return null;
  }
}

/**
 * Append a structured event to the integrity log.
 *
 * @param {object} event
 */
function logEvent(event) {
  try {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }
    const line = JSON.stringify({ ts: new Date().toISOString(), ...event }) + '\n';
    fs.appendFileSync(LOG_FILE, line, 'utf8');
  } catch (err) {
    console.error('[Integrity] Failed to write log:', err.message);
  }
}

/**
 * Validate a set of files against their known-good hashes.
 *
 * @param {Record<string, string>} baseline – { absoluteFilePath: expectedHash }
 * @returns {{ ok: boolean, violations: string[] }}
 */
function validateFiles(baseline) {
  if (!baseline || typeof baseline !== 'object') {
    throw new TypeError('baseline must be a non-null object mapping file paths to hashes');
  }

  const violations = [];

  for (const [filePath, expectedHash] of Object.entries(baseline)) {
    const actualHash = hashFile(filePath);

    if (actualHash === null) {
      violations.push(filePath);
      logEvent({ type: 'FILE_MISSING', file: filePath });
      console.warn(`[Integrity] MISSING  ${filePath}`);
    } else if (actualHash !== expectedHash) {
      violations.push(filePath);
      logEvent({ type: 'HASH_MISMATCH', file: filePath, expected: expectedHash, actual: actualHash });
      console.warn(`[Integrity] TAMPERED ${filePath}`);
    }
  }

  return { ok: violations.length === 0, violations };
}

/**
 * Build a baseline snapshot from the files that currently exist on disk.
 * Useful for seeding the baseline during a trusted first run.
 *
 * @param {string[]} filePaths
 * @returns {Record<string, string>}
 */
function buildBaseline(filePaths) {
  const baseline = {};
  for (const filePath of filePaths) {
    const hash = hashFile(filePath);
    if (hash !== null) {
      baseline[filePath] = hash;
    }
  }
  return baseline;
}

/**
 * Initialise the Integrity Heart.
 * Validates the hearts/ source files against a provided (or empty) baseline.
 *
 * @param {Record<string, string>} [baseline]
 * @returns {{ ok: boolean, violations: string[] }}
 */
function init(baseline) {
  const effectiveBaseline = baseline || {};
  const result = validateFiles(effectiveBaseline);
  const label = result.ok ? 'OK' : `VIOLATIONS(${result.violations.length})`;
  logEvent({ type: 'INIT', status: label });
  console.log(`[Integrity] init status=${label}`);
  return result;
}

module.exports = { hashFile, logEvent, validateFiles, buildBaseline, init };
