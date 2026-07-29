#!/data/data/com.termux/files/usr/bin/bash
#
# termux-claude-proot.sh — Install Claude Code on Termux the way that works:
#                          inside a minimal Ubuntu (glibc) userland.
#
# WHY: Claude Code's core is a native binary shipped as a linux-only, glibc
# optional npm dependency. On bare Termux `process.platform === 'android'` so
# npm skips it (hence "claude native binary not installed"), and even forced it
# won't run against Android's bionic libc. Inside a proot Ubuntu userland the
# platform is 'linux' and glibc is present, so it installs and runs normally.
#
# Run INSIDE Termux:
#   bash scripts/termux-claude-proot.sh
#   # then, in Termux:
#   claude
#
# Idempotent: safe to re-run if a step fails partway (e.g. the rootfs download).
#
set -euo pipefail

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

DISTRO="ubuntu"

step "Checking environment"
[ "${PREFIX:-}" = "/data/data/com.termux/files/usr" ] \
  || die "Run this INSIDE Termux (PREFIX='${PREFIX:-unset}')."
ok "Running inside Termux ($(uname -m))"

retry() {
  local attempt=1 max=4 delay=2
  while true; do
    if "$@"; then return 0; fi
    [ "$attempt" -ge "$max" ] && die "Failed after $max attempts: $*"
    warn "Attempt $attempt failed; retrying in ${delay}s..."
    sleep "$delay"; attempt=$((attempt + 1)); delay=$((delay * 2))
  done
}

# ----------------------------------------------------------------------------
# 1. proot-distro on the Termux side
# ----------------------------------------------------------------------------
step "Installing proot-distro"
export DEBIAN_FRONTEND=noninteractive
retry pkg update -y
retry pkg install -y proot-distro
ok "proot-distro ready"

# ----------------------------------------------------------------------------
# 2. Ubuntu (glibc) userland — the rootfs download can be large
# ----------------------------------------------------------------------------
step "Installing the $DISTRO userland (glibc)"
if proot-distro list 2>/dev/null | grep -qiE "^[[:space:]]*${DISTRO}\b.*installed"; then
  ok "$DISTRO already installed"
else
  retry proot-distro install "$DISTRO"
  ok "$DISTRO installed"
fi

# ----------------------------------------------------------------------------
# 3. Node.js + Claude Code INSIDE the userland (platform === 'linux', glibc)
# ----------------------------------------------------------------------------
step "Installing Node.js and Claude Code inside $DISTRO"
proot-distro login "$DISTRO" -- bash -lc '
  set -e
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  apt-get install -y curl ca-certificates git ripgrep
  if ! command -v node >/dev/null 2>&1 || [ "$(node -p "process.versions.node.split(\".\")[0]" 2>/dev/null || echo 0)" -lt 18 ]; then
    curl -fsSL https://deb.nodesource.com/setup_lts.x | bash -
    apt-get install -y nodejs
  fi
  # Allow the postinstall explicitly in case npm gates scripts here too.
  npm install -g --allow-scripts=@anthropic-ai/claude-code @anthropic-ai/claude-code
  echo "Claude Code: $(claude --version 2>/dev/null || echo installed)"
' || die "Install inside $DISTRO failed. Re-run this script; it resumes safely."
ok "Claude Code installed inside $DISTRO"

# ----------------------------------------------------------------------------
# 4. Remove any broken bare-Termux `claude` that would shadow the launcher
# ----------------------------------------------------------------------------
step "Clearing any broken bare-Termux install"
command -v npm >/dev/null 2>&1 && npm uninstall -g @anthropic-ai/claude-code >/dev/null 2>&1 || true
# Cover every place a broken bare `claude` can live, including a symlink at
# $PREFIX/bin/claude left by an old `npm -g`/pkg install that points at the
# glibc claude.exe (which can't run on bionic and would shadow our launcher).
for stale in \
  "$(npm config get prefix 2>/dev/null)/bin/claude" \
  "$HOME/.npm-global/bin/claude" \
  "$PREFIX/bin/claude"; do
  if [ -L "$stale" ] || [ -e "$stale" ]; then rm -f "$stale" && info "Removed shadowing $stale"; fi
done
ok "No conflicting bare install remains"

# ----------------------------------------------------------------------------
# 5. `claude` launcher on the Termux side
# ----------------------------------------------------------------------------
step "Adding a 'claude' launcher to Termux"
# Typing `claude` drops into the userland and runs Claude Code, forwarding any
# args and binding shared storage (if granted) so it can edit phone files.
LAUNCHER="$PREFIX/bin/claude"
# rm first: if $LAUNCHER is a symlink, `>` would write THROUGH it and clobber
# the link target instead of replacing the launcher.
rm -f "$LAUNCHER"
cat > "$LAUNCHER" <<EOF
#!/data/data/com.termux/files/usr/bin/bash
# Launch Claude Code inside the $DISTRO (glibc) userland.
BIND=()
if [ -d "\$HOME/storage/shared" ]; then
  BIND=(--bind "\$HOME/storage/shared:/root/shared")
fi
exec proot-distro login $DISTRO "\${BIND[@]}" -- claude "\$@"
EOF
chmod +x "$LAUNCHER"
ok "Created $LAUNCHER"

# ----------------------------------------------------------------------------
# 6. Verify Claude Code actually RUNS (not just that it is on PATH)
# ----------------------------------------------------------------------------
# `command -v claude` only proves the launcher exists — it does not prove the
# glibc binary executes under proot. Run `claude --version` inside the userland
# so a broken install fails loudly here instead of the first time you use it.
step "Verifying Claude Code runs inside $DISTRO"
if CC_VER="$(proot-distro login "$DISTRO" -- claude --version 2>&1)"; then
  ok "Claude Code runs: $CC_VER"
else
  warn "Claude Code is installed but did not run cleanly:"
  info "$CC_VER"
  info "Re-run this script (it is idempotent), or see docs/TERMUX.md."
fi

step "All set \xf0\x9f\x8e\x89"
cat <<EOF

  Claude Code now runs on your phone via the $DISTRO userland.

  ${BOLD}Use it:${RESET}
    ${GREEN}claude${RESET}              # start Claude Code (logs in on first run)
    ${GREEN}claude --version${RESET}    # verify

  ${BOLD}Edit your phone's files (optional):${RESET}
    ${GREEN}termux-setup-storage${RESET}    # grant permission, then reopen Termux
  Shared storage then appears as /root/shared inside Claude Code.

  ${BOLD}Full shell in the userland:${RESET}
    ${GREEN}proot-distro login $DISTRO${RESET}

  Troubleshooting: docs/TERMUX.md
EOF
