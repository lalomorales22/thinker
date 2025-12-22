#!/bin/bash

# 🧠 Thinker UI Quick Start Script
# Run this to launch the complete UI and Backend

echo "🧠 Starting Thinker..."
echo ""

# Function to handle cleanup on exit
cleanup() {
    echo ""
    echo "🛑 Stopping services..."
    if [ -n "$BACKEND_PID" ]; then
        kill $BACKEND_PID
    fi
    exit
}

# Trap Ctrl+C
trap cleanup SIGINT

# Start Backend
echo "🚀 Starting Backend Server..."
cd "$(dirname "$0")/backend"

# Check for virtual environment
if [ -d "venv" ]; then
    source venv/bin/activate
else
    echo "⚠️  Virtual environment 'venv' not found in backend/"
    echo "   Please create it or ensure dependencies are installed."
fi

# Run uvicorn in background
uvicorn main:app --reload --port 8000 &
BACKEND_PID=$!
echo "✅ Backend running (PID: $BACKEND_PID)"
echo ""

# Start Frontend
echo "🚀 Starting Frontend..."
cd ../frontend

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    echo ""
fi

echo "✨ The UI will open at: http://localhost:5173"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Press Ctrl+C to stop both servers"
echo ""

npm run dev

# Cleanup when frontend stops
cleanup
