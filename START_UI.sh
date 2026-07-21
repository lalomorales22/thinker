#!/bin/bash
# 🧠 Thinker — one-command launcher for backend + frontend.
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "🧠 Starting Thinker…"

cleanup() { echo ""; echo "🛑 Stopping…"; [ -n "$BACKEND_PID" ] && kill "$BACKEND_PID" 2>/dev/null; exit 0; }
trap cleanup SIGINT SIGTERM

# --- Backend ---------------------------------------------------------------
cd "$ROOT/backend"

if [ ! -d ".venv" ]; then
  # Pick a Tinker-compatible Python (3.11–3.13; the SDK isn't happy on 3.14+ yet).
  PYBIN=""
  for c in python3.12 python3.11 python3.13 python3.10; do
    command -v "$c" >/dev/null 2>&1 && { PYBIN="$c"; break; }
  done
  [ -z "$PYBIN" ] && PYBIN="python3"
  echo "📦 Creating backend virtualenv (.venv) with $PYBIN…"
  "$PYBIN" -m venv .venv
fi

# Verify the dependencies on EVERY run, not just when the venv is created.
# A .venv can exist while being empty — an interrupted install, a copied repo,
# a half-finished first run — and the old check ("does .venv exist?") skipped
# straight to launching, which died with a bare "No module named uvicorn".
if ! ./.venv/bin/python -c "import uvicorn, fastapi" >/dev/null 2>&1; then
  echo "📦 Installing backend dependencies (first run takes a few minutes)…"
  ./.venv/bin/python -m pip install -q --upgrade pip
  ./.venv/bin/python -m pip install -q -r requirements.txt || {
    echo "⚠️  Some backend deps failed (likely 'tinker' — needs a Tinker account)."
    echo "    The app still runs; training/inference need the Tinker SDK + a key."
  }
  if ! ./.venv/bin/python -c "import uvicorn" >/dev/null 2>&1; then
    echo "❌ Backend dependencies did not install. Fix the errors above, then re-run."
    exit 1
  fi
fi

if lsof -ti:8000 >/dev/null 2>&1; then
  echo "⚠️  Port 8000 is already in use — an old backend may still be running."
  echo "    Stop it with:  pkill -f 'uvicorn main:app'"
fi

echo "🚀 Backend → http://localhost:8000"
# Scope --reload to source only. The app writes storage/ (SQLite, datasets) and
# logs/ inside this very directory, so an unscoped watcher would restart the
# server every time a training step records a metric — mid-run.
./.venv/bin/python -m uvicorn main:app --port 8000 \
  --reload --reload-dir . \
  --reload-exclude 'storage/*' \
  --reload-exclude 'logs/*' \
  --reload-exclude '*.db' \
  --reload-exclude '*.log' &
BACKEND_PID=$!

# --- Frontend --------------------------------------------------------------
cd "$ROOT/frontend"
# Check for the actual binary, not just the folder — a partial npm install
# leaves node_modules/ present but unusable.
if [ ! -x "node_modules/.bin/vite" ]; then
  echo "📦 Installing frontend dependencies…"
  npm install
fi

echo "✨ Frontend → http://localhost:5173"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Tip: add your Tinker API key in Settings, or use Demo mode (no key needed)."
echo "Press Ctrl+C to stop both."
npm run dev

cleanup
