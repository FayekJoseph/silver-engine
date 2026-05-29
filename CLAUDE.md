# CLAUDE.md

Guidance for AI assistants (and humans) working in the **Silver Engine** repository.

## What this repo is

Silver Engine is a modular system organized around three foundational
components called **"hearts"**:

1. **Identity** — generates and validates the engine's unique cryptographic
   fingerprint.
2. **Integrity** — performs runtime code validation and guards against
   unauthorized changes or tampering.
3. **Support** — provides recovery, debugging, and adaptation so the engine
   keeps running.

The README also describes a React Native UI layer (chat screen, components,
services) intended to sit on top of the hearts.

## ⚠️ Current state vs. the README (read this first)

The project is at an **early scaffold stage**. The README documents an
*aspirational* layout, but most of it does not exist on disk yet. Do not assume
a file or directory exists because the README mentions it — verify before
referencing or importing.

**What actually exists right now:**

```
silver-engine/
├── README.md            # Project vision + aspirational structure
├── LICENSE              # Apache License 2.0
├── .gitignore           # Ignores target/, generated/, Config.toml, Dependencies.toml
└── hearts/
    └── identity.js      # Placeholder — just a console.log, no real logic yet
```

**Described in the README but NOT yet created:** `hearts/integrity.js`,
`hearts/support.js`, `src/` (screens/components/services), `base_state/`,
`tests/`, `logs/`, `.github/`. There is also **no `package.json`**, so there is
no build, dependency manifest, or test runner configured yet.

When you add a piece the README promised, prefer to make the on-disk structure
match the README — and keep the README accurate if plans change.

## Tech stack (intended)

The README and `.gitignore` point at a stack that hasn't been wired up yet:

- **JavaScript / Node.js** for the hearts (`crypto` module for hashing &
  validation).
- **React Native + TypeScript** for the UI (`.tsx` screens/components).
- **Jest** for testing the three hearts.
- The `.gitignore` references `Config.toml`, `Dependencies.toml`, and `target/`
  (Ballerina/Rust-style artifacts), suggesting another toolchain may be
  introduced. Confirm the intended approach before committing to one.

Because nothing is installed or configured, **there are currently no build,
lint, or test commands**. If you introduce tooling, add the corresponding
scripts (e.g. a `package.json` with `test`/`lint` scripts) and document them in
this section.

## Development workflow

Per the README's roadmap, work proceeds heart-by-heart:

1. **Flesh out `hearts/` components**
   - `identity.js`: implement cryptographic identity generation/validation.
   - `integrity.js`: add hash-based runtime integrity checks.
   - `support.js`: build recovery/fallback mechanisms.
2. **Connect UI and backend** via `src/screens/ChatScreen.tsx` and `src/services/`.
3. **Add tests** (Jest) covering each heart.
4. **Record integrity events** under `logs/`.

### Git conventions

- **Branch**: develop on the feature branch assigned to your task; create it
  locally if needed. Never push to `main` without explicit permission.
- **Commits**: short, imperative, descriptive. Match the existing history style:
  - `Scaffold identity.js for Silver Engine`
  - `Update README with Silver Engine three-heart model`
- **Push**: `git push -u origin <branch-name>`.
- **PRs**: do not open a pull request unless explicitly asked.

## Conventions & guidance for AI assistants

- **Verify before you trust the README.** It is a vision document; the
  filesystem is the source of truth. Check that a path exists before editing or
  importing it.
- **Keep placeholders honest.** `hearts/identity.js` is currently a stub. If you
  only scaffold something, say so in the file and the commit message rather than
  implying it's complete.
- **Match surrounding style.** With so little code, set good precedents:
  clear comments, small focused modules, no unrelated drive-by changes.
- **Security-sensitive domain.** The hearts deal with cryptographic identity,
  tamper detection, and recovery. Be careful and explicit with any crypto,
  hashing, or validation logic; prefer well-reviewed standard libraries over
  hand-rolled primitives.
- **Update docs alongside code.** When you create one of the planned files or
  add tooling, update both the README structure and the "Current state" and
  "Tech stack" sections above so they stay accurate.
- **Don't invent commands.** If asked to build/test/lint and no tooling exists,
  set it up (and document it) rather than guessing at a command that won't run.
