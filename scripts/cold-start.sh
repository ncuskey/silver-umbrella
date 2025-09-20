#!/usr/bin/env bash
# Cold start helper for the standalone Next.js deployment.
# Performs dependency checks, builds the app, syncs static assets next to the
# standalone server output, starts supporting containers, and finally launches
# the standalone server.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

log() {
  printf '\n[ColdStart] %s\n' "$1"
}

ensure_tool() {
  local tool="$1"
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "[ColdStart] Required tool '$tool' is not installed." >&2
    exit 1
  fi
}

log "Checking Node.js version"
node scripts/check-node.mjs

if [[ "${SKIP_INSTALL:-0}" != "1" ]]; then
  log "Installing npm dependencies (SKIP_INSTALL=1 to skip)"
  npm install
else
  log "Skipping npm install (SKIP_INSTALL=1)"
fi

if [[ -f "docker-compose.local.yml" ]]; then
  if command -v docker >/dev/null 2>&1; then
    log "Starting local containers (LanguageTool, fixer, Ollama)"
    docker compose -f docker-compose.local.yml up -d languagetool fixer ollama
  else
    log "Docker not available; skipping container startup"
  fi
else
  log "docker-compose.local.yml not found; skipping container startup"
fi

log "Building Next.js standalone output"
npm run build

STANDALONE_DIR=".next/standalone"
STATIC_SRC=".next/static"
PUBLIC_SRC="public"

if [[ ! -d "$STANDALONE_DIR" ]]; then
  echo "[ColdStart] Standalone build output not found at $STANDALONE_DIR" >&2
  exit 1
fi

log "Syncing .next/static into standalone output"
rm -rf "$STANDALONE_DIR/static"
cp -R "$STATIC_SRC" "$STANDALONE_DIR/static"

log "Syncing public/ into standalone output"
rm -rf "$STANDALONE_DIR/public"
cp -R "$PUBLIC_SRC" "$STANDALONE_DIR/public"

if [[ "${RUN_SMOKE_TESTS:-1}" == "1" ]]; then
  if command -v curl >/dev/null 2>&1; then
    log "Running smoke checks for LanguageTool and LLM (set RUN_SMOKE_TESTS=0 to skip)"
    npm run smoke:lt || echo "[ColdStart] LanguageTool smoke test failed"
    npm run smoke:llm || echo "[ColdStart] LLM smoke test failed"
  else
    log "curl not available; skipping smoke tests"
  fi
else
  log "Skipping smoke tests (RUN_SMOKE_TESTS=${RUN_SMOKE_TESTS})"
fi

log "Starting standalone server"
exec npm start
