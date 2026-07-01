#!/data/data/com.termux/files/usr/bin/bash
#
# termux-setup.sh — Install / repair Claude Code inside Termux on Android.
#
# Run this INSIDE Termux on your phone:
#
#   curl -fsSL https://raw.githubusercontent.com/fayekjoseph/silver-engine/claude/termix-device-bug-jkv6hw/scripts/termux-setup.sh -o termux-setup.sh
#   bash termux-setup.sh
#
# or, if you already cloned the repo:
#
#   bash scripts/termux-setup.sh
#
# It fixes the two things that block Claude Code on a real device:
#
#   1. THE POSTINSTALL IS SKIPPED.  Newer npm (and any npm with script
#      gating / `allow-scripts` enabled) does NOT run a package's install
#      scripts by default.  Claude Code places its `claude` launcher from a
#      `postinstall` (`node install.cjs`).  So `npm install -g
#      @anthropic-ai/claude-code` prints "changed 1 package" and yet
#      `~/.npm-global/bin/claude` never appears.  This script allows that
#      one script and, as a belt-and-braces fallback, runs install.cjs by
#      hand if `claude` is still missing.
#
#   2. IT WRITES TO THE WRONG SHELL RC.  Many Termux setups use zsh, not
#      bash.  Appending PATH only to ~/.bashrc leaves `claude` off PATH.
#      This script updates the rc for your active shell (zsh AND/OR bash).
#
# It is idempotent: safe to re-run if a step fails partway.
#
set -euo pipefail

# ----------------------------------------------------------------------------
# Pretty output
# ----------------------------------------------------------------------------
if [ -t 1 ]; then
  BOLD="$(printf '\033[1m')"; GREEN="$(printf '\033[32m')"
  YELLOW="$(printf '\033[33m')"; RED="$(printf '\033[31m')"
  BLUE="$(printf '\033[34m')"; RESET="$(printf '\033[0m')"
else
  BOLD=""; GREEN=""; YELLOW=""; RED=""; BLUE=""; RESET=""
fi
step()  { printf '\n%s==>%s %s%s\n' "$BLUE$BOLD" "$RESET$BOLD" "$1" "$RESET"; }
info()  { printf '    %s\n' "$1"; }
ok()    { printf '%s  \xe2\x9c\x93 %s%s\n' "$GREEN" "$1" "$RESET"; }
warn()  { printf '%s  ! %s%s\n' "$YELLOW" "$1" "$RESET"; }
die()   { printf '%s  \xe2\x9c\x97 %s%s\n' "$RED" "$1" "$RESET" >&2; exit 1; }

# ----------------------------------------------------------------------------
# 0. Must be inside Termux
# ----------------------------------------------------------------------------
step "Checking environment"
if [ "${PREFIX:-}" != "/data/data/com.termux/files/usr" ]; then
  die "Run this INSIDE Termux on your Android device (PREFIX='${PREFIX:-unset}').
      Install Termux from F-Droid (https://f-droid.org), open it, then re-run."
fi
ok "Running inside Termux ($(uname -m))"

retry() {
  # Retry transient network failures with exponential backoff.
  local attempt=1 max=4 delay=2
  while true; do
    if "$@"; then return 0; fi
    [ "$attempt" -ge "$max" ] && die "Failed after $max attempts: $*"
    warn "Attempt $attempt failed; retrying in ${delay}s..."
    sleep "$delay"; attempt=$((attempt + 1)); delay=$((delay * 2))
  done
}

# ----------------------------------------------------------------------------
# 1. Repair package state + update/upgrade
# ----------------------------------------------------------------------------
step "Repairing Termux package state"
# A half-finished upgrade leaves dpkg broken; fix that before anything else.
dpkg --configure -a >/dev/null 2>&1 || warn "dpkg --configure -a reported issues (continuing)"
export DEBIAN_FRONTEND=noninteractive
retry pkg update -y
# force-conf* keeps the upgrade non-interactive even when a config file
# changed — the usual reason a Termux upgrade appears to "hang".
retry pkg upgrade -y -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold
ok "Termux base is up to date"

# ----------------------------------------------------------------------------
# 2. Install Node.js + tooling Claude Code needs
# ----------------------------------------------------------------------------
step "Installing Node.js and tooling"
# nodejs-lts: modern Node (>=18).  git: repo ops.  ripgrep: native build that
# replaces Claude Code's bundled glibc rg (which won't run on Android/bionic).
retry pkg install -y nodejs-lts git ripgrep which coreutils

NODE_VERSION="$(node --version 2>/dev/null || echo none)"
NODE_MAJOR="$(printf '%s' "$NODE_VERSION" | sed -n 's/^v\([0-9]\{1,\}\).*/\1/p')"
if [ -z "$NODE_MAJOR" ] || [ "$NODE_MAJOR" -lt 18 ]; then
  warn "Node $NODE_VERSION is < v18; installing the 'nodejs' package instead..."
  retry pkg install -y nodejs
  NODE_VERSION="$(node --version 2>/dev/null || echo none)"
fi
ok "Node.js $NODE_VERSION / npm $(npm --version 2>/dev/null || echo '?')"

# ----------------------------------------------------------------------------
# 3. npm global prefix under $HOME (no root, no EACCES)
# ----------------------------------------------------------------------------
step "Configuring npm global prefix"
NPM_GLOBAL="$(npm config get prefix 2>/dev/null || true)"
case "$NPM_GLOBAL" in
  "$HOME"/*) : ;;                       # already user-owned — keep it
  *) NPM_GLOBAL="$HOME/.npm-global"; npm config set prefix "$NPM_GLOBAL" ;;
esac
mkdir -p "$NPM_GLOBAL/bin"
export PATH="$NPM_GLOBAL/bin:$PATH"
ok "npm global prefix: $NPM_GLOBAL"

# ----------------------------------------------------------------------------
# 4. Work out which shell rc file(s) to update (zsh AND/OR bash)
# ----------------------------------------------------------------------------
# Primary rc is chosen from the active login shell ($SHELL); we also update
# any other common rc that already exists so PATH works whichever shell you
# open.  This is the fix for "installed but `claude` not found" on zsh.
RC_FILES=()
case "${SHELL:-}" in
  *zsh)  RC_FILES+=("$HOME/.zshrc") ;;
  *)     RC_FILES+=("$HOME/.bashrc") ;;
esac
for extra in "$HOME/.zshrc" "$HOME/.bashrc" "$HOME/.profile"; do
  case " ${RC_FILES[*]} " in
    *" $extra "*) : ;;
    *) [ -f "$extra" ] && RC_FILES+=("$extra") ;;
  esac
done

append_once() {
  # append_once <line> — append to every target rc file if not already there.
  local line="$1" f
  for f in "${RC_FILES[@]}"; do
    if ! grep -qF -- "$line" "$f" 2>/dev/null; then
      printf '\n# Added by silver-engine termux-setup.sh\n%s\n' "$line" >> "$f"
    fi
  done
}

append_once 'export PATH="$HOME/.npm-global/bin:$PATH"'
# Tell Claude Code to use Termux-native ripgrep, not its bundled glibc binary.
append_once 'export USE_BUILTIN_RIPGREP=0'
export USE_BUILTIN_RIPGREP=0
ok "Updated shell rc: ${RC_FILES[*]}"

# ----------------------------------------------------------------------------
# 5. Install Claude Code — RUNNING ITS POSTINSTALL
# ----------------------------------------------------------------------------
step "Installing Claude Code"
PKG="@anthropic-ai/claude-code"

# Primary path: allow the package's install script so `claude` gets placed.
# `--allow-scripts=<pkg>` is honoured by npm builds that gate scripts (the
# exact remedy npm itself prints).  On npm builds that don't know the flag it
# is ignored and scripts run anyway, so this is safe either way.
retry npm install -g --allow-scripts="$PKG" "$PKG"

# Fallback: if the launcher still isn't there, the postinstall was skipped.
# Run install.cjs by hand from the installed package directory.
if ! command -v claude >/dev/null 2>&1; then
  warn "'claude' not on PATH yet — running the postinstall manually..."
  CC_DIR="$NPM_GLOBAL/lib/node_modules/$PKG"
  [ -d "$CC_DIR" ] || CC_DIR="$(npm root -g 2>/dev/null)/$PKG"
  if [ -f "$CC_DIR/install.cjs" ]; then
    ( cd "$CC_DIR" && node install.cjs ) || warn "install.cjs reported an issue"
  else
    warn "Could not find install.cjs under '$CC_DIR'."
  fi
fi
hash -r 2>/dev/null || true

# ----------------------------------------------------------------------------
# 6. Verify it actually RUNS (not just that the file exists)
# ----------------------------------------------------------------------------
step "Verifying the install"
if ! command -v claude >/dev/null 2>&1; then
  die "'claude' still isn't on PATH.
      Open a new session (or 'source' your shell rc) and check:
        ls \"$NPM_GLOBAL/bin\" | grep claude"
fi

if claude --version >/dev/null 2>&1; then
  ok "Claude Code works: $(claude --version 2>/dev/null || echo installed)"
  DONE_OK=1
else
  DONE_OK=0
  warn "'claude' is installed but failed to execute."
  warn "That points to the native-binary-vs-bionic issue: Claude Code's core"
  warn "is a glibc binary and Termux uses Android's bionic libc, so it can't"
  warn "run bare. Use the proot (glibc userland) fallback in docs/TERMUX.md."
fi

# ----------------------------------------------------------------------------
# 7. Next steps
# ----------------------------------------------------------------------------
step "Next steps"
RELOAD="source ~/.bashrc"
case "${SHELL:-}" in *zsh) RELOAD="source ~/.zshrc" ;; esac

if [ "$DONE_OK" = "1" ]; then
  cat <<EOF

  ${BOLD}Claude Code is installed in Termux.${RESET}

    1. Reload PATH in this shell:  ${GREEN}${RELOAD}${RESET}
    2. Start it (logs in on first run):  ${GREEN}claude${RESET}

  Troubleshooting / re-run notes: docs/TERMUX.md
EOF
else
  cat <<EOF

  ${BOLD}The launcher is installed but doesn't run on bare Termux.${RESET}
  Claude Code's native core is a linux/glibc binary; Android/bionic can't run
  it. Use the proot method instead (installs a small Ubuntu glibc userland and
  a 'claude' launcher on the Termux side):

      ${GREEN}bash scripts/termux-claude-proot.sh${RESET}

  Full walk-through: docs/TERMUX.md
EOF
fi
