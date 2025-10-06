# How to Use Thinker

A plain guide to using every feature of the Thinker AI training platform.

---

## Getting Started

### 1. Launch the Application

```bash
./START_UI.sh
```

The app opens at `http://localhost:5173`

### 2. First Time Setup

1. Click the **Settings** icon (⚙️) in the top-right corner
2. Enter your **Tinker API Key** (required for training)
3. Verify **Backend URL** is `http://localhost:8000`
4. Adjust training defaults if needed:
   - **Base Model**: Which model to start from
   - **LoRA Rank**: 32 is a good default
   - **Learning Rate**: 1e-4 is standard
   - **Batch Size**: 4 for most GPUs
5. Click anywhere outside the modal to save (settings auto-save)

**Your settings are saved permanently** - you only need to do this once.

---

## The Interface

### Main Layout

```
┌─────────────────────────────────────────────────────────┐
│ THINKER [●] v1.0.0          [Training] [🤖] [⚙️]       │ ← Top Bar
├──┬──────────────────────────────────────────┬──────────┤
│  │                                          │  AI      │
│⚡│                                          │ Assistant│
│📦│         Main Content Area               │ (Right   │
│💾│                                          │ Sidebar) │
│💬│                                          │          │
│📊│                                          │          │
│  ├──────────────────────────────────────────┴──────────┤
│  │ Terminal Console                                    │
│  │ > Thinker initialized...                            │
└──┴─────────────────────────────────────────────────────┘
   ↑
Left Sidebar
```

### Toggle Panels

- **Terminal**: Click terminal icon (⚙️) in top-right
- **AI Assistant**: Click bot icon (🤖) in top-right
- Both panels remember their state

---

## 5 Main Views

Click icons on the **left sidebar** to switch views:

### ⚡ 1. Training Dashboard

**What it does**: Create and monitor AI training jobs.

**How to use**:

1. Click **"Deploy New Job"** button
2. Fill in the form:
   - **Job Name**: Something memorable (e.g., "Code Review v1")
   - **Base Model**: Pick from dropdown (uses your settings default)
   - **Training Type**:
     - **SL** (Supervised Learning) - Learn from labeled examples
     - **RL** (Reinforcement Learning) - Learn from rewards
     - **RLHF** (RL with Human Feedback) - Learn from preferences
     - **DPO** (Direct Preference Optimization) - Advanced RLHF
   - **Learning Rate**: How fast the model learns (smaller = safer)
   - **LoRA Rank**: Model capacity (higher = more powerful, slower)
   - **Batch Size**: How many examples per step (depends on GPU)
   - **Total Steps**: How long to train (1000 is a good start)
3. Click **"Deploy Job"**

**What you see**:
- **12 metric widgets** showing:
  - Active/Completed/Queued/Failed jobs
  - GPU utilization
  - Total training steps
  - GPU hours used
  - Average loss
  - Models trained
  - Datasets available
  - Success rate
  - Checkpoints saved
- **Live job cards** with progress bars and metrics
- **Colored LED indicators** for job status:
  - 🔵 Cyan = Running
  - 🟢 Green = Completed
  - 🔴 Red = Failed
  - 🟡 Yellow = Queued

---

### 📦 2. Models Library

**What it does**: Browse, manage, and export trained models.

**How to use**:

1. Click on any model to view details
2. Use the right sidebar to:
   - Copy checkpoint path
   - Test in playground
   - Export model
   - Delete model

**Model types**:
- **Base**: Pre-trained foundation models
- **Fine-tuned**: Your trained models (SL)
- **RLHF**: Models trained with human feedback

**Quick actions**:
- **Preview icon** (👁️): See model details
- **Download icon** (⬇️): Export model weights
- **Delete icon** (🗑️): Remove model

---

### 💾 3. Dataset Manager

**What it does**: Upload and manage training datasets.

**How to upload**:

1. Click **"Upload Dataset"** button
2. Fill in:
   - **Dataset Name**: Descriptive name
   - **Dataset Type**:
     - Code Review - Code + review pairs
     - Preference Pairs - A vs B comparisons
     - RL Reward - State + action + reward
     - QA - Question + answer pairs
     - Custom - Your own format
   - **File Format**: JSONL, JSON, or CSV
   - **Upload File**: Drag & drop or click to browse
   - **Data Split**: Train/Validation/Test percentages (80/15/5 is standard)
3. Click **"Upload Dataset"**

**Dataset formats**:

**JSONL (recommended)**:
```jsonl
{"code": "def hello():\n  print('hi')", "review": "Good function"}
{"code": "x=1+1", "review": "Use better variable names"}
```

**JSON**:
```json
[
  {"code": "...", "review": "..."},
  {"code": "...", "review": "..."}
]
```

**CSV**:
```csv
code,review
"def hello()...","Good function"
```

---

### 💬 4. Playground

**What it does**: Test your models interactively with code review.

**How to use**:

**Left Panel - Code Input**:
1. Select programming language from dropdown
2. Paste or type code in the Monaco editor
3. Click **"Review Code"** button

**Right Panel - Conversation**:
1. Select which model to use from dropdown
2. Click settings icon (⚙️) to adjust:
   - **Temperature**: 0 = deterministic, 1 = creative
   - **Max Tokens**: How long the response can be
3. See model responses appear below

**Tips**:
- Use **RotateCcw icon** (🔄) to clear and start over
- Responses show model name, tokens used, and latency

---

### 📊 5. Analytics Dashboard

**What it does**: View training metrics, charts, and performance data.

**How to use**:

1. Select time range from dropdown:
   - Last 24 Hours
   - Last 7 Days
   - Last 30 Days
   - All Time
2. View metrics cards showing training performance
3. See charts and visualizations (when data is available)

**What you'll see** (when training):
- Loss curves over time
- Reward trends
- Accuracy improvements
- Training run comparisons

---

## AI Assistant Sidebar

**Located on the right side of the screen.**

### System Status
Shows real-time connection and resource info:
- API Connection status
- Models loaded count
- Active jobs count

### Quick Actions
Click to navigate instantly:
- **New Training Job** → Goes to Training Dashboard
- **Upload Dataset** → Goes to Dataset Manager
- **Browse Models** → Goes to Models Library

### Recent Activity
Shows your latest actions and model updates.

---

## Terminal Console

**Located at the bottom of the screen.**

### What it shows:
- System initialization messages
- WebSocket connection status
- Tinker SDK events
- Training job updates
- Error messages
- API responses

### Reading terminal output:
- **[timestamp]** in gray
- **Cyan text** = System messages
- **Blue text** = Info messages
- **Green text** = Success messages
- **Red text** = Errors

### Using the terminal:
- Currently read-only (displays logs)
- Future: Will support command input

---

## Common Workflows

### Workflow 1: Train Your First Model

1. **Prepare dataset**:
   - Go to Dataset Manager (💾)
   - Click "Upload Dataset"
   - Upload your JSONL/JSON/CSV file
   - Set train/val/test split

2. **Configure settings**:
   - Click Settings (⚙️)
   - Enter Tinker API key
   - Set training defaults
   - Close settings

3. **Start training**:
   - Go to Training Dashboard (⚡)
   - Click "Deploy New Job"
   - Fill in job details
   - Choose your uploaded dataset
   - Click "Deploy Job"

4. **Monitor progress**:
   - Watch metrics update in real-time
   - Check terminal for detailed logs
   - View progress bar on job card

5. **When complete**:
   - Model appears in Models Library (📦)
   - Test it in Playground (💬)
   - Export if needed

### Workflow 2: Compare Two Models

1. Go to Models Library (📦)
2. Click first model → "Test in Playground"
3. Enter test code
4. Note the response
5. Switch model dropdown to second model
6. Compare responses

### Workflow 3: Monitor Training Health

1. Go to Training Dashboard (⚡)
2. Check metric widgets:
   - GPU Util should be high (>80%)
   - Avg Loss should decrease over time
   - Failed jobs = 0
3. Click on running job card
4. Watch loss/reward metrics
5. Check terminal for errors

---

## Tips & Best Practices

### Training Tips

**Start small**:
- 1000 steps for testing
- Small batch size (4) if GPU memory is limited
- Lower LoRA rank (16-32) is faster

**Optimize later**:
- Increase steps when you're confident (5000-10000)
- Increase batch size if you have GPU headroom
- Higher LoRA rank (64-128) for better quality

**Monitor metrics**:
- Loss should decrease steadily
- If loss increases, learning rate is too high
- If loss plateaus, try more steps

### Dataset Tips

**Quality over quantity**:
- 100 high-quality examples > 1000 mediocre ones
- Clean, consistent formatting
- Diverse examples covering edge cases

**Data splits**:
- 80/15/5 (train/val/test) is standard
- Validation catches overfitting
- Test measures final performance

**File formats**:
- JSONL is fastest for large datasets
- JSON is easier to edit manually
- CSV works for simple key-value pairs

### Model Tips

**Naming convention**:
- Include version numbers: `code-review-v1`, `code-review-v2`
- Include purpose: `python-linter`, `security-audit`
- Include base model: `llama3-code-review`

**Testing**:
- Always test in Playground before production
- Try edge cases and unusual inputs
- Compare against base model

**Checkpoints**:
- Save checkpoints every 500 steps
- Keep top 3 best checkpoints
- Delete failed experiments

---

## Keyboard Shortcuts

Currently, navigation is click-based. Future updates will add:
- `Ctrl+1-5`: Switch between views
- `Ctrl+K`: Open command palette
- `Ctrl+T`: Toggle terminal
- `Ctrl+B`: Toggle AI assistant

---

## Troubleshooting

### "No connection to backend"
1. Check terminal for errors
2. Verify Backend URL in Settings
3. Make sure backend is running: `cd backend && python main.py`

### "Training job failed"
1. Check terminal for error message
2. Verify API key is correct
3. Check dataset format is valid
4. Reduce batch size if GPU out of memory

### "Settings not saving"
- Settings auto-save - just close the modal
- Check browser console for localStorage errors
- Clear browser cache and try again

### "Upload dataset button doesn't work"
- File must be < 500MB
- Format must be JSONL, JSON, or CSV
- Check terminal for upload errors

### "Models not appearing"
- Wait for training job to complete (100% progress)
- Refresh the page
- Check Models Library view (📦)

---

## API Integration (Future)

When connecting to real Tinker API:

1. **Get API key** from [Tinker Console](https://tinker-console.thinkingmachines.ai)
2. **Enter in Settings** → Tinker API Key
3. **Start training** - jobs will run on Tinker infrastructure
4. **Monitor in UI** - real-time updates via WebSocket

---

## Getting Help

### Within the app:
- Check terminal console for error messages
- Hover over icons for tooltips
- LED indicators show status at a glance

### External resources:
- [Tinker Docs](https://tinker-docs.thinkingmachines.ai/)
- [Tinker Console](https://tinker-console.thinkingmachines.ai)
- [BUILD.md](BUILD.md) - Full feature roadmap
- [README.md](README.md) - Quick overview

---

## Quick Reference

| View | Icon | Purpose | Key Action |
|------|------|---------|------------|
| Training Dashboard | ⚡ | Start & monitor training | Deploy New Job |
| Models Library | 📦 | Browse trained models | Click model to view |
| Dataset Manager | 💾 | Upload training data | Upload Dataset |
| Playground | 💬 | Test models interactively | Review Code |
| Analytics | 📊 | View performance metrics | Select time range |

| LED Color | Meaning |
|-----------|---------|
| 🔵 Cyan | Active/Running |
| 🟢 Green | Completed/Success |
| 🔴 Red | Error/Failed |
| 🟡 Yellow | Queued/Warning |
| 🟣 Purple | AI/ML Operations |
| 🔷 Teal | Active/Ready |

---

**You're ready to train AI models!** Start with the Training Dashboard and work through Workflow 1 above.
