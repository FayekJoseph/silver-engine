# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current state of the repository

This repository is an **early-stage scaffold**. Be aware that the README describes
the *intended* design, but most of it does not exist on disk yet. As of now the
only source file that exists is `hearts/identity.js`, which is a placeholder that
just logs an initialization message.

Directories referenced in the README (`src/`, `base_state/`, `tests/`, `logs/`,
`.github/`) and the other two "hearts" (`integrity.js`, `support.js`) have **not
been created yet**. When asked to "extend" or "fix" a component, first check
whether the file actually exists rather than assuming the README layout is real.

There is no `package.json`, no dependency manifest, and no configured build, lint,
or test tooling yet. Do not assume `npm`/`jest` commands work — they will fail
until that tooling is added. If a task requires building or testing, the first
step is to introduce the appropriate tooling (see "Tooling intent" below).

Note a discrepancy worth resolving with the user before committing to a stack:
the README describes a Node.js / React Native project (JavaScript, Jest, the
`crypto` module), while `.gitignore` is written for a Ballerina project
(`Config.toml`, `Dependencies.toml`, `target/`, `generated/`). Confirm the
intended language/runtime before scaffolding build tooling.

## Concept: the three "hearts"

The Silver Engine is organized around three foundational components ("hearts"),
each intended to live as a file under `hearts/`:

1. **Identity** (`hearts/identity.js`) — generates and validates the engine's
   unique cryptographic fingerprint.
2. **Integrity** (`hearts/integrity.js`, not yet created) — runtime code
   validation; hash-based checks that protect against tampering or unauthorized
   changes.
3. **Support** (`hearts/support.js`, not yet created) — recovery, debugging, and
   adaptation to keep the engine running (fallback operations).

This three-part separation is the core architectural idea: identity establishes
*who* the engine is, integrity verifies it *stays* unchanged at runtime, and
support provides resilience when something goes wrong.

## Tooling intent (from README — not yet wired up)

- **UI**: React Native, with `src/screens/ChatScreen.tsx` as the base chat UI and
  `src/services/` for API communication and TTS/voice processing.
- **Crypto**: Node.js `crypto` (or equivalent) for hashing and identity validation.
- **Testing**: Jest, with tests verifying the behavior of the three hearts.
- **Integrity logs**: `logs/` intended to record runtime changes / tampering
  attempts.
- **Base state**: `base_state/identity_manifest.json` and
  `base_state/clean_snapshots/` intended as an immutable reference for validation.

## Git workflow

- Development for documentation work happens on the `claude/claude-md-docs-gesnvf`
  branch; `main` is the default branch.
- Do not create pull requests unless explicitly requested.
