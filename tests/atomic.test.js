'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const { atomicWrite, beginTransaction } = require('../src/pitr/atomic');

let dir;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pitr-atomic-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('atomicWrite', () => {
  test('creates a file', () => {
    const dest = path.join(dir, 'hello.txt');
    atomicWrite(dest, Buffer.from('hi'));
    expect(fs.readFileSync(dest, 'utf8')).toBe('hi');
  });

  test('creates nested directories as needed', () => {
    const dest = path.join(dir, 'a', 'b', 'c', 'deep.txt');
    atomicWrite(dest, Buffer.from('deep'));
    expect(fs.readFileSync(dest, 'utf8')).toBe('deep');
  });

  test('leaves no temp files behind', () => {
    const dest = path.join(dir, 'clean.txt');
    atomicWrite(dest, Buffer.from('x'));
    expect(fs.readdirSync(dir)).toEqual(['clean.txt']);
  });
});

describe('beginTransaction', () => {
  test('set + commit writes the files', () => {
    const tx = beginTransaction(dir);
    tx.set('one.txt', Buffer.from('1'));
    tx.set(path.join('nested', 'two.txt'), Buffer.from('2'));
    const summary = tx.commit();

    expect(fs.readFileSync(path.join(dir, 'one.txt'), 'utf8')).toBe('1');
    expect(fs.readFileSync(path.join(dir, 'nested', 'two.txt'), 'utf8')).toBe('2');
    expect(summary.written.sort()).toEqual(['one.txt', path.join('nested', 'two.txt')].sort());
    expect(summary.removed).toEqual([]);
  });

  test('remove + commit deletes a file', () => {
    const victim = path.join(dir, 'gone.txt');
    fs.writeFileSync(victim, 'bye');

    const tx = beginTransaction(dir);
    tx.remove('gone.txt');
    const summary = tx.commit();

    expect(fs.existsSync(victim)).toBe(false);
    expect(summary.removed).toEqual(['gone.txt']);
    expect(summary.written).toEqual([]);
  });

  test('rollback() (no commit) leaves the tree untouched', () => {
    fs.writeFileSync(path.join(dir, 'keep.txt'), 'original');

    const tx = beginTransaction(dir);
    tx.set('keep.txt', Buffer.from('changed'));
    tx.set('new.txt', Buffer.from('new'));
    tx.remove('keep.txt');
    tx.rollback();

    expect(fs.readFileSync(path.join(dir, 'keep.txt'), 'utf8')).toBe('original');
    expect(fs.existsSync(path.join(dir, 'new.txt'))).toBe(false);
  });

  test('staging without committing leaves originals intact', () => {
    fs.writeFileSync(path.join(dir, 'stay.txt'), 'as-is');

    const tx = beginTransaction(dir);
    tx.set('stay.txt', Buffer.from('would-change'));
    tx.set('phantom.txt', Buffer.from('phantom'));
    // never commit and never rollback

    expect(fs.readFileSync(path.join(dir, 'stay.txt'), 'utf8')).toBe('as-is');
    expect(fs.existsSync(path.join(dir, 'phantom.txt'))).toBe(false);
  });

  test('commit failure rolls back already-applied paths', () => {
    fs.writeFileSync(path.join(dir, 'good.txt'), 'original');
    // Pre-create a directory that a later staged write will collide with,
    // making the rename/write throw deterministically.
    fs.mkdirSync(path.join(dir, 'collision'));

    const tx = beginTransaction(dir);
    tx.set('good.txt', Buffer.from('updated'));
    tx.set('collision', Buffer.from('cannot-write-over-a-directory'));

    expect(() => tx.commit()).toThrow();

    // The valid path must be rolled back to its original content.
    expect(fs.readFileSync(path.join(dir, 'good.txt'), 'utf8')).toBe('original');
    // The collision target remains the directory it was.
    expect(fs.statSync(path.join(dir, 'collision')).isDirectory()).toBe(true);
  });
});
