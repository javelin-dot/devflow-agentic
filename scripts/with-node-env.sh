#!/usr/bin/env bash
# Activate fnm/nvm Node version for this OS, set DevFlow env vars, run a command.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

NODE_VERSION="$(node "$ROOT/scripts/read-version.mjs")"

export PUPPETEER_SKIP_DOWNLOAD=true
export DEVFLOW_NODE_PROFILE="${DEVFLOW_NODE_PROFILE:-$(node "$ROOT/scripts/read-platform.mjs")}"

activate_fnm() {
  if ! command -v fnm >/dev/null 2>&1; then
    return 1
  fi
  eval "$(fnm env)"
  fnm use "$NODE_VERSION" --install-if-missing
  return 0
}

activate_nvm() {
  if [[ -z "${NVM_DIR:-}" ]] && [[ -s "$HOME/.nvm/nvm.sh" ]]; then
    # shellcheck source=/dev/null
    source "$HOME/.nvm/nvm.sh"
  fi
  if ! command -v nvm >/dev/null 2>&1; then
    return 1
  fi
  nvm install "$NODE_VERSION"
  nvm use "$NODE_VERSION"
  return 0
}

if ! activate_fnm; then
  if ! activate_nvm; then
  CURRENT_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
  if [[ "$CURRENT_MAJOR" != "$NODE_VERSION" ]]; then
    echo "[devflow] Install fnm (https://fnm.vercel.app) or nvm, or switch to Node ${NODE_VERSION}.x manually." >&2
    exit 1
  fi
  fi
fi

if [[ $# -eq 0 ]]; then
  echo "Usage: $0 <command> [args...]" >&2
  exit 1
fi

exec "$@"
