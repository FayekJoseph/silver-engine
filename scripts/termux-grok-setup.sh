#!/data/data/com.termux/files/usr/bin/bash
#
# termux-grok-setup.sh — Install / update the Grok CLI (grok-dev) and wire up
#                        its API key the safe way: from the environment, never
#                        hardcoded in source.
#
# Works in Termux directly, or inside a proot userland (Ubuntu) — anywhere Node
# + npm are available.  Run it, then just type `grok`.
#
#   bash scripts/termux-grok-setup.sh
#
# It fixes the two things that bit this project's device:
#   * the `EEXIST: /usr/bin/grok` upgrade failure (removes the stale launcher
#     before reinstalling), and
#   * the 410 "Live search is deprecated" error (installs grok-dev@latest,
#     which targets xAI's current Agent Tools API).
#
# SECURITY: this script NEVER writes your API key into the repo. If you let it
# store the key, it goes to your shell rc on THIS device only (chmod 600),
# read with a hidden prompt. You can also just export GROK_API_KEY yourself.
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

PKG="grok-dev"

# ----------------------------------------------------------------------------
# 0. Need Node + npm (Termux: `pkg install nodejs-lts`; proot: apt install)
# ----------------------------------------------------------------------------
step "Checking prerequisites"
command -v node >/dev/null 2>&1 || die "node not found. In Termux: pkg install nodejs-lts. In proot Ubuntu: apt-get install -y nodejs"
command -v npm  >/dev/null 2>&1 || die "npm not found alongside node."
ok "node $(node --version) / npm $(npm --version)"

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
# 1. Clear any stale `grok` launcher, then install/update to latest
# ----------------------------------------------------------------------------
step "Installing / updating $PKG"
# A prior install can leave the launcher behind so `npm install -g` aborts with
# EEXIST. Remove every copy on PATH (and the usual global bin locations) first.
GLOBAL_BIN="$(npm bin -g 2>/dev/null || echo "$(npm config get prefix 2>/dev/null)/bin")"
for f in "$(command -v grok 2>/dev/null || true)" "$GLOBAL_BIN/grok" "$PREFIX/bin/grok" /usr/bin/grok /usr/local/bin/grok; do
  [ -n "$f" ] && { [ -e "$f" ] || [ -L "$f" ]; } && rm -f "$f" && info "Removed stale launcher: $f"
done

# --force overwrites anything left; --allow-scripts runs the postinstall that
# some npm builds gate (the same gotcha that hid Claude Code's launcher).
retry npm install -g --force --allow-scripts="$PKG" "${PKG}@latest"
hash -r 2>/dev/null || true

command -v grok >/dev/null 2>&1 || die "grok still not on PATH. Open a new shell or check: ls \"$GLOBAL_BIN\""
GROK_VER="$(grok --version 2>/dev/null || echo '?')"
ok "grok $GROK_VER installed (latest fixes the Live-Search 410)"

# ----------------------------------------------------------------------------
# 2. API key — from the environment, never the repo
# ----------------------------------------------------------------------------
step "Configuring the API key (GROK_API_KEY)"

# Pick the rc file for the active shell.
case "${SHELL:-}" in
  *zsh)  RC="$HOME/.zshrc" ;;
  *)     RC="$HOME/.bashrc" ;;
esac

if [ -n "${GROK_API_KEY:-}" ]; then
  ok "GROK_API_KEY is already set in this environment. Nothing to store."
elif grep -q 'GROK_API_KEY' "$RC" 2>/dev/null; then
  ok "GROK_API_KEY is already configured in $RC."
else
  warn "No GROK_API_KEY found."
  info "Get a key at https://console.x.ai  (API Keys -> Create API Key)."
  if [ -t 0 ]; then
    printf '    Paste it now to save it to %s on THIS device (or press Enter to skip): ' "$RC"
    # -s: hidden input, so the key is never echoed to the screen or scrollback.
    stty -echo 2>/dev/null || true
    IFS= read -r KEY || KEY=""
    stty echo 2>/dev/null || true
    printf '\n'
    if [ -n "$KEY" ]; then
      touch "$RC"; chmod 600 "$RC"
      printf '\n# Grok CLI key (local to this device; keep it out of git)\nexport GROK_API_KEY=%q\n' "$KEY" >> "$RC"
      ok "Saved to $RC (chmod 600). Run: source $RC"
      KEY=""   # drop it from memory
    else
      info "Skipped. Set it yourself later:  export GROK_API_KEY=\"xai-...\"  >> $RC"
    fi
  else
    info "Non-interactive shell. Set it later:  echo 'export GROK_API_KEY=\"xai-...\"' >> $RC"
  fi
fi

# ----------------------------------------------------------------------------
# 3. Done
# ----------------------------------------------------------------------------
step "All set \xf0\x9f\x9a\x80"
RELOAD="source $RC"
cat <<EOF

  Grok CLI $GROK_VER is ready.

    1. Load the key into this shell:  ${GREEN}${RELOAD}${RESET}
    2. Start it:                      ${GREEN}grok${RESET}

  ${BOLD}Never${RESET} commit your key. It lives in $RC (this device only), and
  grok reads it from \$GROK_API_KEY at runtime.
EOF
