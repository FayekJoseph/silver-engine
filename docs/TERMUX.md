# Running Claude Code in Termux (Android)

This documents the two real device bugs that stop `claude` from working in
Termux, and the script that fixes them:
[`scripts/termux-setup.sh`](../scripts/termux-setup.sh).

## Quick start

Inside Termux on your phone:

```bash
curl -fsSL https://raw.githubusercontent.com/fayekjoseph/silver-engine/claude/termix-device-bug-jkv6hw/scripts/termux-setup.sh -o termux-setup.sh
bash termux-setup.sh
```

Then reload PATH and run it:

```bash
source ~/.zshrc   # or ~/.bashrc if you use bash
claude
```

---

## Bug 1 — `npm install -g` "succeeds" but `claude` is missing

Symptom (real session):

```text
% npm install -g @anthropic-ai/claude-code
changed 1 package in 3s
npm warn allow-scripts 1 package has install scripts not yet covered by allowScripts:
npm warn allow-scripts   @anthropic-ai/claude-code@2.1.197 (postinstall: node install.cjs)

% ls $(npm config get prefix)/bin | grep -i claude      # <- empty!
```

**Cause.** Claude Code installs its `claude` launcher from a **`postinstall`
script** (`node install.cjs`). Newer npm — and any npm with script gating /
`allow-scripts` turned on (common on security-minded setups) — **does not run
install scripts by default**. npm still reports `changed 1 package`, but
`install.cjs` never ran, so no `claude` binary is placed.

**Fix.** Allow that one script, exactly as npm itself suggests:

```bash
npm install -g --allow-scripts=@anthropic-ai/claude-code @anthropic-ai/claude-code
```

`termux-setup.sh` does this, and if the launcher is *still* missing it runs
`install.cjs` by hand from the installed package directory as a fallback.

To allow it permanently for future global installs:

```bash
npm config set allow-scripts=@anthropic-ai/claude-code --location=user
```

## Bug 2 — installed, but "command not found" (you're on zsh)

Termux frequently runs **zsh**, not bash (your prompt is `%`, not `$`). A setup
that appends the PATH line only to `~/.bashrc` leaves `~/.npm-global/bin` off
PATH in your actual shell, so `claude` looks "not installed".

**Fix.** Add the npm global bin dir to the rc for the shell you actually use:

```bash
echo 'export PATH="$HOME/.npm-global/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

`termux-setup.sh` detects your login shell via `$SHELL` and updates
`~/.zshrc` and/or `~/.bashrc` accordingly (and any that already exist).

## Bug 3 (maybe) — the launcher runs but the core binary won't execute

Symptom:

```text
% claude
Error: claude native binary not installed.
... the platform-native optional dependency was not downloaded (--omit=optional).
```

**Cause.** Claude Code's core is shipped as a **native binary** in a
*platform-specific optional* npm package for `linux`, built against **glibc**.
On Termux `process.platform === 'android'`, so npm **skips** that `linux`
optional package entirely — the binary is never downloaded. And even if forced,
glibc code can't run against Android's **bionic** libc. So running `install.cjs`
by hand can't fix it either: there is no Android-native binary to install.

**Fix.** Run Claude Code inside a minimal glibc userland via `proot-distro`.
One command does it all (installs Ubuntu, Node, Claude Code, and a `claude`
launcher on the Termux side):

```bash
bash scripts/termux-claude-proot.sh
```

Inside that Ubuntu userland `process.platform === 'linux'` and glibc is
present, so the native binary downloads and runs correctly. After it finishes,
just type `claude` in Termux. To do it by hand instead:

```bash
pkg install -y proot-distro
proot-distro install ubuntu
proot-distro login ubuntu -- bash -lc 'apt-get update && apt-get install -y curl git ripgrep && curl -fsSL https://deb.nodesource.com/setup_lts.x | bash - && apt-get install -y nodejs && npm install -g @anthropic-ai/claude-code && claude --version'
```

---

## Other things that commonly break Termux

- **`E: Unable to locate package` / 404s** — a stale or geo-blocked mirror.
  Run `termux-change-repo`, pick a nearby mirror, then `pkg update`.
- **A "stuck" `pkg upgrade`** — a changed config file waiting on a prompt.
  `termux-setup.sh` passes `--force-confdef --force-confold` to avoid it.
- **`EACCES` on global installs** — npm's prefix points at a root-owned dir.
  The script sets the prefix to `~/.npm-global` (no root needed).
- **ripgrep errors** — Claude Code's bundled `rg` is glibc-built. Install the
  native one (`pkg install ripgrep`) and set `USE_BUILTIN_RIPGREP=0`, which the
  script does for you.
