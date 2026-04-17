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
npm run dev
