#!/usr/bin/env node
'use strict';

// Command-line interface for the Silver Engine PITR tool.
//
// Usage:
//   pitr snapshot [--label <text>] [--target <dir>] [--store <dir>]
//   pitr list [--target <dir>]
//   pitr verify <id> [--target <dir>]          # verify snapshot integrity
//   pitr check <id> [--target <dir>]           # verify live target == snapshot
//   pitr compare <idA> <idB> [--target <dir>]  # evaluate change A -> B
//   pitr restore <id> [--no-prune] [--target <dir>]

const { PITR } = require('../src/pitr');

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      if (key === 'no-prune') {
        flags.prune = false;
      } else {
        flags[key] = argv[++i];
      }
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

function main(argv) {
  const { positional, flags } = parseArgs(argv);
  const [command, ...rest] = positional;
  const pitr = new PITR({ target: flags.target || process.cwd(), store: flags.store });

  switch (command) {
    case 'snapshot': {
      const m = pitr.snapshot({ label: flags.label });
      console.log(`Created snapshot ${m.id}`);
      console.log(`  fingerprint: ${m.fingerprint}`);
      console.log(`  files:       ${m.fileCount}`);
      return 0;
    }
    case 'list': {
      const snapshots = pitr.list();
      if (snapshots.length === 0) {
        console.log('No snapshots.');
        return 0;
      }
      for (const s of snapshots) {
        const label = s.label ? `  "${s.label}"` : '';
        console.log(`${s.id}  ${s.createdAt}  ${s.fileCount} files${label}`);
      }
      return 0;
    }
    case 'verify': {
      const result = pitr.verifySnapshot(rest[0]);
      console.log(result.ok ? `OK  snapshot ${rest[0]} is intact` : `FAIL  ${rest[0]}`);
      result.errors.forEach((e) => console.log(`  - ${e}`));
      return result.ok ? 0 : 1;
    }
    case 'check': {
      const result = pitr.verifyTarget(rest[0]);
      console.log(result.ok ? `OK  target matches ${rest[0]}` : `DRIFT  target differs from ${rest[0]}`);
      result.errors.forEach((e) => console.log(`  - ${e}`));
      return result.ok ? 0 : 1;
    }
    case 'compare': {
      const result = pitr.compare(rest[0], rest[1]);
      console.log(`compare ${result.from}  ->  ${result.to}`);
      if (result.identical) {
        console.log('  identical (fingerprints match)');
        return 0;
      }
      result.added.forEach((p) => console.log(`  + ${p}`));
      result.removed.forEach((p) => console.log(`  - ${p}`));
      result.modified.forEach((p) => console.log(`  ~ ${p}`));
      console.log(`  (${result.unchanged} unchanged)`);
      return 0;
    }
    case 'restore': {
      const result = pitr.restore(rest[0], { prune: flags.prune !== false });
      console.log(`Recovered to ${result.id}`);
      console.log(`  restored: ${result.restored} files`);
      if (result.pruned.length) console.log(`  pruned:   ${result.pruned.length} files`);
      console.log(`  verified fingerprint: ${result.fingerprint}`);
      return 0;
    }
    default:
      console.error('Usage: pitr <snapshot|list|verify|check|compare|restore> [options]');
      return 2;
  }
}

if (require.main === module) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { main, parseArgs };
