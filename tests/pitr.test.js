'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const { PITR } = require('../src/pitr');

function tmpTarget() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pitr-'));
}

function write(dir, rel, content) {
  const dest = path.join(dir, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, content);
}

describe('PITR', () => {
  let target;
  let pitr;

  beforeEach(() => {
    target = tmpTarget();
    pitr = new PITR({ target });
  });

  afterEach(() => {
    fs.rmSync(target, { recursive: true, force: true });
  });

  test('snapshot captures files with hashes and a deterministic fingerprint', () => {
    write(target, 'a.txt', 'hello');
    write(target, 'nested/b.txt', 'world');

    const m = pitr.snapshot({ label: 'first' });

    expect(m.label).toBe('first');
    expect(m.fileCount).toBe(2);
    expect(m.files.map((f) => f.path).sort()).toEqual(['a.txt', 'nested/b.txt']);
    expect(m.fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  test('identical content produces an identical fingerprint', () => {
    write(target, 'a.txt', 'same');
    const first = pitr.snapshot();

    const other = tmpTarget();
    write(other, 'a.txt', 'same');
    const otherFingerprint = new PITR({ target: other }).snapshot().fingerprint;
    fs.rmSync(other, { recursive: true, force: true });

    expect(otherFingerprint).toBe(first.fingerprint);
  });

  test('excludes the store directory and default excludes from snapshots', () => {
    write(target, 'keep.txt', 'keep');
    write(target, '.git/config', 'noise');
    write(target, 'node_modules/dep/index.js', 'noise');

    const m = pitr.snapshot();
    expect(m.files.map((f) => f.path)).toEqual(['keep.txt']);
  });

  test('list returns snapshots oldest first', () => {
    write(target, 'a.txt', 'one');
    const first = pitr.snapshot();
    write(target, 'a.txt', 'two');
    const second = pitr.snapshot();

    const ids = pitr.list().map((s) => s.id);
    expect(ids).toEqual([first.id, second.id]);
  });

  test('verifySnapshot passes for an untouched snapshot', () => {
    write(target, 'a.txt', 'hello');
    const m = pitr.snapshot();

    const result = pitr.verifySnapshot(m.id);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test('verifySnapshot detects tampering with stored content', () => {
    write(target, 'a.txt', 'hello');
    const m = pitr.snapshot();

    const storedFile = path.join(target, '.pitr', 'snapshots', m.id, 'files', 'a.txt');
    fs.writeFileSync(storedFile, 'tampered');

    const result = pitr.verifySnapshot(m.id);
    expect(result.ok).toBe(false);
    expect(result.errors).toContain('hash mismatch for a.txt');
  });

  test('restore recovers the exact captured state and verifies it', () => {
    write(target, 'a.txt', 'original');
    const m = pitr.snapshot();

    fs.writeFileSync(path.join(target, 'a.txt'), 'changed');
    write(target, 'new.txt', 'added later');

    const result = pitr.restore(m.id);

    expect(result.fingerprint).toBe(m.fingerprint);
    expect(fs.readFileSync(path.join(target, 'a.txt'), 'utf8')).toBe('original');
    expect(fs.existsSync(path.join(target, 'new.txt'))).toBe(false);
    expect(result.pruned).toEqual(['new.txt']);
    expect(pitr.verifyTarget(m.id).ok).toBe(true);
  });

  test('restore with prune disabled keeps newer files', () => {
    write(target, 'a.txt', 'original');
    const m = pitr.snapshot();
    write(target, 'new.txt', 'added later');

    pitr.restore(m.id, { prune: false });

    expect(fs.existsSync(path.join(target, 'new.txt'))).toBe(true);
  });

  test('restore refuses a corrupt snapshot', () => {
    write(target, 'a.txt', 'hello');
    const m = pitr.snapshot();
    fs.writeFileSync(path.join(target, '.pitr', 'snapshots', m.id, 'files', 'a.txt'), 'corrupt');

    expect(() => pitr.restore(m.id)).toThrow(/corrupt snapshot/);
  });

  test('verifyTarget reports drift without restoring', () => {
    write(target, 'a.txt', 'hello');
    const m = pitr.snapshot();
    fs.writeFileSync(path.join(target, 'a.txt'), 'drift');
    write(target, 'extra.txt', 'extra');

    const result = pitr.verifyTarget(m.id);
    expect(result.ok).toBe(false);
    expect(result.errors).toContain('modified in target: a.txt');
    expect(result.errors).toContain('unexpected in target: extra.txt');
  });

  test('compare evaluates added, removed, and modified files between two snapshots', () => {
    write(target, 'keep.txt', 'same');
    write(target, 'gone.txt', 'will be removed');
    write(target, 'edit.txt', 'before');
    const a = pitr.snapshot({ label: 'A' });

    fs.rmSync(path.join(target, 'gone.txt'));
    fs.writeFileSync(path.join(target, 'edit.txt'), 'after');
    write(target, 'new.txt', 'added');
    const b = pitr.snapshot({ label: 'B' });

    const diff = pitr.compare(a.id, b.id);
    expect(diff.identical).toBe(false);
    expect(diff.added).toEqual(['new.txt']);
    expect(diff.removed).toEqual(['gone.txt']);
    expect(diff.modified).toEqual(['edit.txt']);
    expect(diff.unchanged).toBe(1); // keep.txt
  });

  test('compare reports identical snapshots of unchanged state', () => {
    write(target, 'a.txt', 'stable');
    const a = pitr.snapshot();
    const b = pitr.snapshot();

    const diff = pitr.compare(a.id, b.id);
    expect(diff.identical).toBe(true);
    expect(diff.added).toEqual([]);
    expect(diff.removed).toEqual([]);
    expect(diff.modified).toEqual([]);
  });

  test('throws when constructed without a target', () => {
    expect(() => new PITR({})).toThrow(/requires a target/);
  });
});
