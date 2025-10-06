# 🧠 Thinker

**A love letter to Mira Murati** - Full-stack AI training platform showcasing every capability of the Tinker SDK from Thinking Machines Lab.

## What is Thinker?

An IDE-like platform for training self-evolving AI agents. Build code review models, autonomous debuggers, and multi-agent systems using supervised learning, RL, RLHF, and DPO - all through a beautiful interface.

## ✨ Features

### 5 Fully-Functional Views

1. **⚡ Training Dashboard** - Create & monitor training jobs (SL, RL, RLHF, DPO)
2. **📦 Models Library** - Browse, manage, export trained models
3. **💾 Dataset Manager** - Upload & manage training datasets
4. **💬 Playground** - Interactive code review & chat with Monaco editor
5. **📊 Analytics** - Training metrics, charts, evaluation results

### Technical Highlights

- 🎨 Ultra-dark IDE-inspired interface
- 🔄 Real-time WebSocket training updates
- 🧠 Multi-agent RL and self-improving agents
- 📈 Recharts visualization ready
- 🤖 Tool-augmented AI capabilities
- 💾 Persistent state management (Zustand)

## Architecture

**Backend** (`/backend`)
- FastAPI - Async web framework
- WebSocket - Real-time updates
- Tinker SDK - LLM fine-tuning API
- Python 3.10+

**Frontend** (`/frontend`)
- React 18 + TypeScript
- Vite - Build tool & dev server
- TailwindCSS - Styling
- Monaco Editor - Code display
- Zustand - State management
- Socket.io - Real-time client
- Recharts - Data visualization

## 🚀 Quick Start

### Option 1: One-Command Launch (Recommended)

```bash
./START_UI.sh
```

This script:
- Installs frontend dependencies (if needed)
- Launches the dev server at `http://localhost:5173`
- Shows all 5 available views

### Option 2: Manual Setup

**Prerequisites:**
- Python 3.10+
- Node.js 18+
- Tinker API key

**Backend:**
```bash
cd backend
pip install -r requirements.txt
export TINKER_API_KEY=your_key_here
python main.py
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

**Open:** `http://localhost:5173`

## Development

- Backend: `http://localhost:8000`
- Frontend: `http://localhost:5173`
- WebSocket: `ws://localhost:8000/ws`
- Current mode: UI with mock data (API integration ready)

## 📚 Documentation

- **[BUILD.md](BUILD.md)** - Complete vision, technical roadmap & revolutionary features

## 🎯 Vision

Thinker is more than a training UI - it's a **living laboratory** for next-generation AI training:

- **Multi-Agent Arena** - Agents compete and collaborate, learning from each other
- **Swarm Intelligence** - Evolutionary approach with N model copies
- **Real-time RLHF** - Interactive feedback during training
- **Self-Improving Reward Models** - Models that learn to evaluate themselves
- **Meta-Learning** - Learn optimal hyperparameters from training history
- **Live Code Execution** - Run code in sandboxed containers for verification
- **RAG-Enhanced Review** - Context from docs, codebases, and git history

See [BUILD.md](BUILD.md) for the complete roadmap of revolutionary features.

## 🛠️ Current Status

**✅ Production-Ready UI:**
- 5-view tactical interface with widget design
- No mock data - ready for real API connection
- Zustand state management
- Tactical dark theme with sleek highlights
- Rounded widget borders and glassmorphism

**🔜 Next Steps:**
- Connect Tinker API endpoints
- Implement real-time WebSocket updates
- Add Recharts data visualizations
- Deploy first training job with real agent

## License

MIT

---

*Made w ❤️ by lalo for Mira*
