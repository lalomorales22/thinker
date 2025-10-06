#!/bin/bash

# 🧠 Thinker UI Quick Start Script
# Run this to launch the complete UI

echo "🧠 Starting Thinker UI..."
echo ""

# Navigate to frontend
cd "$(dirname "$0")/frontend"

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
    echo ""
fi

# Start dev server
echo "🚀 Launching dev server..."
echo ""
echo "✨ The UI will open at: http://localhost:5173"
echo ""
echo "Available views:"
echo "  ⚡ Training Dashboard (default)"
echo "  📦 Models Library"
echo "  💾 Dataset Manager"
echo "  💬 Playground"
echo "  📊 Analytics"
echo ""
echo "Click the icons in the left sidebar to switch views!"
echo ""
echo "Press Ctrl+C to stop the server"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

npm run dev
