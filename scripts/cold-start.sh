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

if command -v colima >/dev/null 2>&1; then
  if [[ "${RESTART_COLIMA:-1}" == "1" ]]; then
    if colima status >/dev/null 2>&1; then
      log "Stopping existing Colima instance to free ports"
      colima stop || log "colima stop reported an error (continuing)"
    fi
    log "Starting Colima"
    colima start
  else
    log "Skipping Colima restart (RESTART_COLIMA=${RESTART_COLIMA})"
  fi
fi

if command -v ollama >/dev/null 2>&1; then
  if [[ "${STOP_HOST_OLLAMA:-1}" == "1" ]]; then
    log "Stopping host Ollama service"
    ollama stop || log "ollama stop reported an error (continuing)"
    if command -v brew >/dev/null 2>&1 && brew services list | grep -q "^ollama"; then
      brew services stop ollama || log "brew services stop ollama reported an error (continuing)"
    fi
  else
    log "Skipping host Ollama stop (STOP_HOST_OLLAMA=${STOP_HOST_OLLAMA})"
  fi
fi

if command -v docker >/dev/null 2>&1 || command -v docker-compose >/dev/null 2>&1; then
  log "Waiting for Docker daemon"
  for _ in {1..10}; do
    if docker info >/dev/null 2>&1; then
      break
    fi
    sleep 2
  done
fi

if [[ -f "docker-compose.local.yml" ]]; then
  if command -v docker >/dev/null 2>&1 || command -v docker-compose >/dev/null 2>&1; then
    COMPOSE_SERVICES=""
    if docker compose version >/dev/null 2>&1; then
      COMPOSE_SERVICES="$(docker compose -f docker-compose.local.yml config --services | tr '\n' ' ')"
    elif command -v docker-compose >/dev/null 2>&1; then
      COMPOSE_SERVICES="$(docker-compose -f docker-compose.local.yml config --services | tr '\n' ' ')"
    fi

    if [[ -n "$COMPOSE_SERVICES" ]]; then
      log "Starting local containers ($COMPOSE_SERVICES)"
      if docker compose version >/dev/null 2>&1; then
        docker compose -f docker-compose.local.yml up -d $COMPOSE_SERVICES
      else
        docker-compose -f docker-compose.local.yml up -d $COMPOSE_SERVICES
      fi
    else
      log "No services detected in docker-compose.local.yml; skipping container startup"
    fi
  else
    log "Docker not available; skipping container startup"
  fi
else
  log "docker-compose.local.yml not found; skipping container startup"
fi

if [[ "${START_CF_TUNNEL:-1}" == "1" ]]; then
  if command -v cloudflared >/dev/null 2>&1; then
    CF_TUNNEL_CMD="${CF_TUNNEL_CMD:-cloudflared tunnel run ${CF_TUNNEL_NAME:-autocbm}}"
    CF_LOG_PATH="${CF_TUNNEL_LOG:-${ROOT_DIR}/cloudflared.log}"
    log "Starting Cloudflare tunnel (${CF_TUNNEL_CMD})"
    nohup bash -c "$CF_TUNNEL_CMD" >> "$CF_LOG_PATH" 2>&1 &
    log "Cloudflare tunnel logs: $CF_LOG_PATH"
  else
    log "cloudflared not available; skipping tunnel startup"
  fi
else
  log "Skipping Cloudflare tunnel (START_CF_TUNNEL=${START_CF_TUNNEL})"
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
