#!/bin/bash
# 🧠 Thinker — one-command launcher for backend + frontend.
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "🧠 Starting Thinker…"

cleanup() { echo ""; echo "🛑 Stopping…"; [ -n "$BACKEND_PID" ] && kill "$BACKEND_PID" 2>/dev/null; exit 0; }
trap cleanup SIGINT

# --- Backend ---------------------------------------------------------------
cd "$ROOT/backend"
if [ ! -d ".venv" ]; then
  echo "📦 Creating backend virtualenv (.venv)…"
  python3 -m venv .venv
  ./.venv/bin/python -m pip install -q --upgrade pip
  echo "📦 Installing backend dependencies…"
  ./.venv/bin/python -m pip install -q -r requirements.txt || {
    echo "⚠️  Some backend deps failed (likely 'tinker' — needs a Tinker account)."
    echo "    The app still runs; training/inference need the Tinker SDK + a key."
  }
fi
echo "🚀 Backend → http://localhost:8000"
./.venv/bin/python -m uvicorn main:app --reload --port 8000 &
BACKEND_PID=$!

# --- Frontend --------------------------------------------------------------
cd "$ROOT/frontend"
if [ ! -d "node_modules" ]; then
  echo "📦 Installing frontend dependencies…"
  npm install
fi
echo "✨ Frontend → http://localhost:5173"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Tip: add your Tinker API key in Settings, or use Demo mode (no key needed)."
echo "Press Ctrl+C to stop both."
npm run dev

cleanup
