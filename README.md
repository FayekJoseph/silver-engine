# Silver Engine

The Silver Engine is a modular system designed with three foundational components, or "hearts":

1. **Identity**: Protects and validates the engine's unique cryptographic fingerprint.
2. **Integrity**: Ensures runtime code validation and protects the engine from unauthorized changes or tampering.
3. **Support**: Provides recovery, debugging, and adaptation to ensure continuous operation.

---

## Running Claude Code in Termux (on a device)

If `claude` won't install or run in Termux on your Android phone, use:

```bash
bash scripts/termux-setup.sh
```

It fixes the two common device bugs — npm skipping Claude Code's `postinstall`
(so the `claude` launcher never lands) and PATH being written to the wrong
shell rc (`~/.bashrc` when you actually use zsh). See
[`docs/TERMUX.md`](docs/TERMUX.md) for the full explanation and the proot
fallback.

Want the Grok CLI too? `bash scripts/termux-grok-setup.sh` installs/updates
`grok-dev` (fixing the `EEXIST` upgrade failure and the 410 "Live search
deprecated" error) and wires up `GROK_API_KEY` **from your environment — the
key is never written into the repo.**

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
