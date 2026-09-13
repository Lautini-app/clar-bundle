#!/usr/bin/env bash
# Idempotent Cloud Agent install script for the clar monorepo.
# Prepares three things: MongoDB (system dep), the FastAPI backend
# (Python venv + deps), and the Expo frontend (yarn deps). Safe to re-run.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "[install] repo root: $REPO_ROOT"

# ---------------------------------------------------------------------------
# System dependency: MongoDB 8.0 (only installed if not already present)
# ---------------------------------------------------------------------------
if ! command -v mongod >/dev/null 2>&1; then
  echo "[install] installing MongoDB 8.0 ..."
  . /etc/os-release
  curl -fsSL https://www.mongodb.org/static/pgp/server-8.0.asc \
    | sudo gpg -o /usr/share/keyrings/mongodb-server-8.0.gpg --dearmor
  echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-8.0.gpg ] https://repo.mongodb.org/apt/ubuntu ${VERSION_CODENAME}/mongodb-org/8.0 multiverse" \
    | sudo tee /etc/apt/sources.list.d/mongodb-org-8.0.list >/dev/null
  sudo apt-get update -qq
  sudo apt-get install -y -qq mongodb-org
else
  echo "[install] mongod already present: $(mongod --version | head -1)"
fi
mkdir -p "$REPO_ROOT/.mongo-data"

# ---------------------------------------------------------------------------
# Backend: Python virtualenv + dependencies
# ---------------------------------------------------------------------------
if ! python3 -c 'import ensurepip' >/dev/null 2>&1; then
  echo "[install] installing python venv support ..."
  sudo apt-get update -qq
  sudo apt-get install -y -qq python3-venv
fi

cd "$REPO_ROOT/backend"
if [ ! -d .venv ]; then
  python3 -m venv .venv
fi
# shellcheck disable=SC1091
. .venv/bin/activate
pip install --upgrade pip -q
# emergentintegrations is published on Emergent's package index.
pip install -r requirements.txt \
  --extra-index-url https://d33sy5i8bnduwe.cloudfront.net/simple/
deactivate

if [ ! -f "$REPO_ROOT/backend/.env" ]; then
  echo "[install] writing backend/.env"
  cat > "$REPO_ROOT/backend/.env" <<EOF
MONGO_URL=mongodb://localhost:27017
DB_NAME=clar_dev
JWT_SECRET=clar-dev-secret-please-rotate-min-32-chars-long
EOF
fi

# ---------------------------------------------------------------------------
# Frontend: yarn dependencies
# ---------------------------------------------------------------------------
cd "$REPO_ROOT/frontend"
if [ -f yarn.lock ]; then
  yarn install --frozen-lockfile || yarn install
else
  yarn install
fi

# On web the app uses a MOCK sign-in flow and never calls Supabase, but the
# Supabase client is constructed at import time and needs non-empty values.
# Real project keys should be provided via environment secrets, which take
# precedence over these placeholders.
if [ ! -f "$REPO_ROOT/frontend/.env" ]; then
  echo "[install] writing frontend/.env (placeholders; override via secrets)"
  cat > "$REPO_ROOT/frontend/.env" <<EOF
EXPO_PUBLIC_SUPABASE_URL=${EXPO_PUBLIC_SUPABASE_URL:-https://placeholder.supabase.co}
EXPO_PUBLIC_SUPABASE_ANON_KEY=${EXPO_PUBLIC_SUPABASE_ANON_KEY:-placeholder-anon-key}
EXPO_PUBLIC_RC_IOS_API_KEY=${EXPO_PUBLIC_RC_IOS_API_KEY:-}
EOF
fi

echo "[install] done"
