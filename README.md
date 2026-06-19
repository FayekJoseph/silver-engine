# Silver Engine

The Silver Engine is a modular system designed with three foundational components, or "hearts":

1. **Identity**: Protects and validates the engine's unique cryptographic fingerprint.
2. **Integrity**: Ensures runtime code validation and protects the engine from unauthorized changes or tampering.
3. **Support**: Provides recovery, debugging, and adaptation to ensure continuous operation.

---

## Repository Structure

```plaintext
silver-engine/
├── hearts/                            # Silver Engine components
│   ├── identity.js                    # Identity Heart
│   ├── integrity.js                   # Integrity Heart
│   ├── support.js                     # Support Heart
├── src/                               # UI and core functionality
│   ├── screens/
│   │   └── ChatScreen.tsx             # Chat UI module
│   ├── components/                    # Reusable UI components
│   ├── services/                      # Application back-end services
├── base_state/                        # Immutable base reference
│   ├── identity_manifest.json         # Base states for identity
│   └── clean_snapshots/               # Placeholder for clean snapshots
├── tests/                             # Automated test suites
├── logs/                              # Integrity monitoring logs
├── .github/                           # CI/CD workflows
├── README.md                          # Documentation
```

---

## Next Steps

### Development Workflow
   1. **Extend `hearts/` components**:
      - Implement cryptographic validation in `identity.js`.
      - Add hash-based runtime checks in `integrity.js`.
      - Build a recovery mechanism in `support.js` for fallback operations.

   2. **Connect UI and Backend**:
      - Use `src/screens/ChatScreen.tsx` as the base UI.
      - Integrate `services/` for API communication and TTS/Voice processing.

   3. **Automated Testing**:
      - Add tests using `Jest` to verify the behavior of the three hearts.

   4. **Integrity Logs**:
      - Use `logs/` to record runtime changes or tampering attempts for analysis.

### Tooling and Dependencies
   - React Native for the UI components.
   - Crypto libraries (e.g., `crypto` in Node.js) for hashing and validation.
   - Testing libraries like `Jest` for ensuring reliability.

---

## PITR — Point-In-Time Recovery

The PITR tool is the Support heart in action: it captures **verifiable**
snapshots of the engine's state and recovers that state on demand. Every
snapshot carries a cryptographic fingerprint (Identity) and per-file SHA-256
hashes (Integrity), so a recovery can be *proven* correct rather than assumed.

```plaintext
src/pitr/
├── fingerprint.js   # SHA-256 hashing + order-independent state fingerprint
├── store.js         # immutable snapshot storage (default: .pitr/)
├── pitr.js          # snapshot / verify / restore engine
└── index.js         # public API
bin/pitr.js          # command-line interface
```

### How it works

1. **Snapshot** — walk the target directory, hash every file, and derive a
   single fingerprint from the sorted `path:hash` pairs. The snapshot is stored
   immutably under `.pitr/`.
2. **Verify** — re-hash the stored files and re-derive the fingerprint to prove
   a snapshot has not been corrupted or tampered with (`pitr verify`).
3. **Check** — compare the *live* target against a snapshot to detect drift or
   tampering without restoring (`pitr check`).
4. **Restore** — recover the target to the exact captured state. The snapshot is
   verified before recovery and the result is verified after, so `restore` only
   succeeds when the target provably equals the captured point in time.

### CLI

```bash
npm install                       # install dev dependencies (Jest)

node bin/pitr.js snapshot --label "clean state"
node bin/pitr.js list
node bin/pitr.js verify  <snapshot-id>           # snapshot integrity (tamper check)
node bin/pitr.js check   <snapshot-id>           # live target vs snapshot (drift check)
node bin/pitr.js compare <snapshot-A> <snapshot-B>  # evaluate change A -> B
node bin/pitr.js restore <snapshot-id>           # recover; add --no-prune to keep newer files
```

### Programmatic API

```js
const { PITR } = require('./src/pitr');

const pitr = new PITR({ target: process.cwd() });
const snap = pitr.snapshot({ label: 'clean state' });

pitr.verifySnapshot(snap.id); // { ok, fingerprint, errors }
pitr.verifyTarget(snap.id);   // { ok, errors } — drift detection
pitr.compare(a.id, b.id);     // { identical, added, removed, modified, unchanged }
pitr.restore(snap.id);        // { id, fingerprint, restored, pruned }
```

### Testing

```bash
npm test
```
