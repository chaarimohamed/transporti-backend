#!/usr/bin/env bash
# =============================================================================
# Transporti – Start Backend Only
# Usage: npm run start:backend  OR  bash transporti-backend/scripts/start.sh
# =============================================================================
set -e

[ ! -f "$(dirname "$0")/../.env" ] && {
  echo "[error] .env not found in transporti-backend/. Run 'npm run setup' from repo root first."
  exit 1
}

cd "$(dirname "$0")/.."

PORT=$(grep -E '^PORT=' .env 2>/dev/null | head -1 | cut -d'=' -f2 | tr -d '[:space:]')
PORT=${PORT:-3000}

find_port_pids() {
  local port="$1"

  if command -v lsof >/dev/null 2>&1; then
    lsof -ti tcp:"$port" 2>/dev/null | sort -u
    return
  fi

  if command -v fuser >/dev/null 2>&1; then
    fuser -n tcp "$port" 2>/dev/null | tr ' ' '\n' | sed '/^$/d' | sort -u
    return
  fi

  ss -ltnp 2>/dev/null | awk -v p=":$port" '$4 ~ p {print $NF}' | sed -n 's/.*pid=\([0-9]\+\).*/\1/p' | sort -u
}

PIDS=$(find_port_pids "$PORT" || true)
if [ -n "$PIDS" ]; then
  echo "[warn] Port $PORT is already in use by PID(s): $PIDS"
  echo "[warn] Stopping existing process(es) before starting backend..."
  echo "$PIDS" | xargs -r kill
  sleep 1

  # Force kill if any process is still holding the port.
  REMAINING=$(find_port_pids "$PORT" || true)
  if [ -n "$REMAINING" ]; then
    echo "[warn] Force stopping remaining PID(s): $REMAINING"
    echo "$REMAINING" | xargs -r kill -9
    sleep 1
  fi
fi

npm run dev
