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

---

## Deep Dive: Training Types

### Supervised Learning (SL)

**What it is**: The model learns from input→output examples.

**When to use**:
- You have correct examples (e.g., good code reviews)
- Your task has clear right/wrong answers
- You want the model to mimic your examples

**How it works**:
1. Model sees input: "Review this code: `def hello(): print('hi')`"
2. Model predicts output token by token
3. Compare to correct output: "Good function, follows PEP 8"
4. Adjust model to make correct output more likely

**Metrics explained**:
- **Loss**: How different model output is from correct answer
  - Start: Usually 1.5-2.5
  - Target: Below 0.5 means model learned well
  - If increasing: Learning rate too high
  - If not decreasing: Dataset too hard or learning rate too low
  - If spiking: Unstable training, reduce learning rate

- **Perplexity**: How "confused" the model is
  - Lower = better
  - Perplexity = exp(loss)
  - Example: loss of 0.69 = perplexity of 2.0

**Example datasets**:
- Code + review pairs
- Question + answer pairs
- Text + summary pairs

**Best practices**:
- Start with 100-500 high-quality examples
- Use consistent formatting across examples
- Validate that examples are actually correct
- Monitor validation loss to catch overfitting

---

### Reinforcement Learning (RL)

**What it is**: The model learns from rewards/scores, not perfect examples.

**When to use**:
- You can score outputs but don't have perfect examples
- Task has many correct answers
- You want to optimize for a metric (test pass rate, user satisfaction)

**How it works**:
1. Model generates multiple outputs (samples)
2. Each output gets a reward score
3. High-reward outputs → reinforce (make more likely)
4. Low-reward outputs → suppress (make less likely)

**Metrics explained**:
- **Average Reward**: Mean score across samples
  - Higher = better
  - Should increase over training
  - Track this as your primary success metric

- **KL Divergence**: How much policy changed from base model
  - Safe range: 0.001 to 0.01
  - Warning: >0.1 (model drifting too far)
  - Critical: >1.0 (training unstable)
  - Use KL penalty to keep this in check

- **Policy Loss**: RL training objective
  - Should decrease
  - Negative values are normal
  - Large swings indicate instability

- **Policy Entropy**: How random/deterministic the model is
  - High entropy: Model is exploring (random)
  - Low entropy: Model is confident (deterministic)
  - Red flag: Dropping to near-zero means model collapsed

**Example use cases**:
- Code that passes tests → +1 reward
- Fast code → reward based on execution time
- User thumbs up/down → +1/-1 reward
- Security vulnerabilities found → +10 reward

**Best practices**:
- Start with simple reward functions
- Normalize rewards to [-1, 1] or [0, 1] range
- Use baseline subtraction to reduce variance
- Monitor KL divergence closely

---

### RLHF (RL from Human Feedback)

**What it is**: Two-stage training using human preferences.

**When to use**:
- You have pairwise comparisons (A is better than B)
- Humans can judge quality but can't create perfect examples
- You want to align with subjective preferences

**How it works**:

**Stage 1: Train Reward Model**
1. Collect human preferences: "Review A is better than Review B"
2. Train a model to predict which output humans prefer
3. This becomes your reward model

**Stage 2: RL Training**
4. Generate model outputs
5. Reward model scores them
6. Use scores as rewards for RL
7. Model learns to maximize reward model's score

**Metrics explained**:
- **Reward Model Accuracy**: How well reward model predicts preferences
  - Target: >70% means reward model is useful
  - <60%: Not enough training data or bad labels
  - >90%: Excellent reward model

- **Mean Reward**: Average score from reward model
  - Should increase during training
  - Compare to baseline model

- **Win Rate**: % of times new model beats old model
  - Target: >60% means improvement
  - <50%: Model got worse
  - 50%: No change

- **KL Divergence**: Same as RL (monitor drift)
  - Keep in safe range: 0.001 to 0.01

**Dataset format**:
```jsonl
{"prompt": "Review this code...", "chosen": "Good review", "rejected": "Bad review"}
```

**Best practices**:
- Need at least 1000 preference pairs
- Ensure preferences are consistent
- Use multiple human labelers
- Validate reward model before RL stage
- Monitor for reward hacking

---

### DPO (Direct Preference Optimization)

**What it is**: Learn from preferences WITHOUT a separate reward model.

**When to use**:
- Same as RLHF but you want simpler/faster training
- You have preference data
- You don't need a separate reward model

**How it works**:
1. Collect preferences: A > B
2. Directly update model to increase P(A) and decrease P(B)
3. Use reference model to prevent over-fitting
4. One-stage instead of two-stage like RLHF

**Metrics explained**:
- **DPO Loss**: Classification loss on preferences
  - Should decrease
  - Below 0.5 = good
  - Below 0.3 = excellent

- **Chosen Reward**: How much model prefers chosen outputs
  - Should increase
  - Indicates model learning preferences

- **Rejected Reward**: How much model prefers rejected outputs
  - Should decrease or stay flat
  - Should be lower than chosen reward

- **Reward Margin**: Gap between chosen and rejected
  - Should increase
  - Larger = stronger preference learning
  - Typical: 0.5 to 5.0

- **Implicit Reward Accuracy**: % of times chosen > rejected
  - Target: >80% means strong learning
  - <60%: Model struggling to learn preferences

**Advantages over RLHF**:
- Simpler (one model instead of two)
- Faster (no reward model training)
- More stable (no RL optimization issues)
- Less hyperparameter tuning

**Dataset format**: Same as RLHF
```jsonl
{"prompt": "...", "chosen": "...", "rejected": "..."}
```

**Best practices**:
- Need 500-5000 preference pairs
- Beta parameter (default 0.1) controls strength
- Higher beta = stronger preference learning
- Monitor margin to ensure learning
- Compare to reference model regularly

---

## 📊 Complete Metrics Glossary

### Training Metrics

**Loss** (All training types)
- **What**: Error between model predictions and targets
- **Range**: 0.3 to 3.0 typically
- **Goal**: Decreasing over time
- **Red flags**:
  - Increasing: Learning rate too high
  - Not decreasing: Dataset too hard or learning rate too low
  - Spiking: Unstable training, reduce learning rate
  - Stuck at high value (>2.0): Model not learning, check data format
- **Troubleshooting**:
  - If loss >3.0: Check dataset format, might be corrupted
  - If loss oscillates wildly: Reduce learning rate by 10x
  - If loss plateaus early: Increase model capacity (LoRA rank) or learning rate

**Learning Rate**
- **What**: Size of optimization steps
- **LoRA Typical**: 1e-4 to 5e-4
- **Full Fine-tune Typical**: 1e-5 to 5e-5
- **Formula**: `lr_lora = lr_full_finetune × (20 to 100)`
- **Red flags**:
  - Too high: Loss increases or spikes
  - Too low: Training extremely slow, no improvement after 100s steps
- **Adaptive schedules**:
  - Cosine decay: Starts high, gradually decreases
  - Linear warmup: Starts low, increases, then decays
  - Constant: Same throughout (simplest)
- **Rule of thumb**: Start at 1e-4, halve if unstable, double if too slow

**Gradient Norm**
- **What**: Size of gradient updates
- **Typical**: 0.1 to 10.0
- **Red flags**:
  - >100: Exploding gradients, reduce LR or use gradient clipping
  - <0.01: Vanishing gradients, increase LR or check model initialization
- **Gradient clipping**: Limit max norm to 1.0 or 5.0 to prevent explosions

**Perplexity** (SL only)
- **What**: How "surprised" the model is by the data
- **Formula**: `perplexity = exp(loss)`
- **Typical**: 2.0 to 20.0
- **Lower = better**: Model is more confident
- **Example**:
  - Loss 0.69 → Perplexity 2.0 (excellent)
  - Loss 1.39 → Perplexity 4.0 (good)
  - Loss 2.30 → Perplexity 10.0 (needs improvement)

---

### RL-Specific Metrics

**KL Divergence**
- **What**: How much policy changed from base model
- **Safe range**: 0.001 to 0.01
- **Warning**: >0.1 (model drifting too far)
- **Critical**: >1.0 (training unstable, may produce gibberish)
- **Purpose**: Prevents model from deviating too far from safe base model
- **Tuning**:
  - If KL too high: Increase KL penalty coefficient
  - If KL too low: Model not learning, decrease KL penalty

**Average Reward**
- **What**: Mean score across generated samples
- **Goal**: Increasing over time
- **Typical**: Task-dependent (normalize to [-1, 1] or [0, 1])
- **Monitoring**:
  - Plot over time to see learning trend
  - Compare to baseline/random policy
  - Should plateau at optimal performance

**Policy Entropy**
- **What**: How random/deterministic the model is
- **High entropy (>3.0)**: Model is exploring (random)
- **Low entropy (<0.5)**: Model is confident (deterministic)
- **Red flag**: Dropping to near-zero means model collapsed (mode collapse)
- **Balance**: Want some entropy for exploration, but not too much

**Policy Loss**
- **What**: RL training objective (policy gradient)
- **Should decrease over time**
- **Negative values are normal**
- **Large swings indicate instability**

**Advantage** (if using baselines)
- **What**: How much better an action is than average
- **Positive**: Better than average
- **Negative**: Worse than average
- **Zero mean**: Properly normalized

---

### RLHF/DPO-Specific Metrics

**Reward Margin** (DPO)
- **What**: Gap between chosen and rejected rewards
- **Goal**: Increasing (model learning preferences)
- **Typical**: 0.5 to 5.0
- **Interpretation**:
  - <0.5: Weak preference learning
  - 0.5-2.0: Good learning
  - >2.0: Strong preference learning
- **Red flag**: Decreasing margin means model getting worse

**Chosen/Rejected Rewards**
- **Chosen**: Should increase or stay high
- **Rejected**: Should decrease or stay low
- **Goal**: Maximize gap between them
- **Problem**: If rewards converge, model not learning

**DPO Loss**
- **What**: Bradley-Terry preference loss
- **Range**: 0.0 to 1.0+ (classification loss)
- **Goal**: Decreasing
- **Targets**:
  - <0.5: Good
  - <0.3: Excellent
  - <0.1: Outstanding
- **Red flag**: Stuck above 0.7 means poor preference learning

**Implicit Reward Accuracy** (DPO)
- **What**: % of times chosen > rejected in model's view
- **Target**: >80% means strong learning
- **Poor**: <60% (model struggling)
- **Excellent**: >90%
- **Use**: Validation metric for preference learning

**Reward Model Accuracy** (RLHF)
- **What**: How well reward model predicts human preferences
- **Target**: >70% useful, >80% good, >90% excellent
- **Poor**: <60% (need more data or better model)
- **Use**: Validate reward model before RL stage

---

### System Metrics

**GPU Utilization**
- **Target**: 70-95%
- **Low (<50%)**: Batch size too small or slow data loading
- **Unstable**: GPU memory issues or thermal throttling
- **100% constant**: Good! GPU fully utilized
- **Optimization**: Increase batch size to max out GPU

**Tokens/Second**
- **What**: Training throughput
- **Typical**: 1,000 to 100,000 depending on model size
- **Use**: Compare across runs to detect slowdowns
- **Optimization**:
  - Larger batch size = more tokens/sec
  - Smaller model = more tokens/sec
  - Better data loading = more tokens/sec

**GPU Memory Usage**
- **Watch**: Should be stable at high percentage (80-95%)
- **Red flag**: Growing over time (memory leak)
- **OOM (Out of Memory)**:
  - Reduce batch size
  - Reduce LoRA rank
  - Reduce sequence length
  - Use gradient checkpointing
- **Monitoring**: Check peak memory vs. available

**Steps per Second**
- **What**: Training iteration speed
- **Typical**: 0.1 to 10 steps/sec depending on setup
- **Use**: Estimate time to completion
- **Formula**: `time_remaining = (total_steps - current_step) / steps_per_sec`

**Samples per Second**
- **What**: Training examples processed per second
- **Formula**: `samples_per_sec = batch_size × steps_per_sec`
- **Higher = faster training**
- **Optimization**: Increase batch size if GPU has headroom

---

### Hyperparameters Guide

**LoRA Rank**
- **What**: Model capacity, number of trainable parameters
- **Options**: 8, 16, 32, 64, 128, 256
- **Small (8-16)**: Fast, good for <100 examples
- **Medium (32-64)**: Standard, good for 100-5K examples
- **Large (128-256)**: Slow, good for >5K examples or complex tasks
- **Tradeoff**: Higher rank = more capacity but slower training

**Batch Size**
- **What**: Examples processed together per step
- **Options**: 1, 2, 4, 8, 16, 32
- **Small (1-4)**: Less GPU memory, more stable, slower
- **Large (16-32)**: More GPU memory, less stable, faster
- **Rule of thumb**: Largest that fits in GPU memory
- **Gradient accumulation**: Simulate larger batches by accumulating gradients

**Training Steps**
- **What**: How long to train
- **Quick test**: 100-500 steps
- **Standard**: 1000-2000 steps
- **Thorough**: 5000-10000 steps
- **Calculation**: `epochs = steps × batch_size / dataset_size`
- **Rule**: 2-5 epochs is typical

**Warmup Steps**
- **What**: Gradually increase learning rate at start
- **Typical**: 0-100 steps
- **Purpose**: Prevents early instability
- **Formula**: `warmup_steps = 0.1 × total_steps` (10% warmup)

---

### Troubleshooting Decision Tree

**Loss is increasing:**
1. Learning rate too high → Reduce by 10x
2. Bad data batch → Check dataset format
3. Gradient explosion → Enable gradient clipping

**Loss not decreasing:**
1. Learning rate too low → Increase by 2-5x
2. Dataset too small → Get more data
3. Task too hard → Simplify or use larger model

**Training is slow:**
1. Increase batch size (if GPU has memory)
2. Reduce LoRA rank (if quality is acceptable)
3. Reduce sequence length
4. Use more efficient optimizer

**GPU out of memory:**
1. Reduce batch size by half
2. Reduce LoRA rank (128→64→32)
3. Reduce max sequence length
4. Enable gradient checkpointing

**Model outputs gibberish:**
1. KL divergence too high → Increase KL penalty
2. Learning rate too high → Reduce by 10x
3. Reward hacking (RL/RLHF) → Revise reward function
4. Bad checkpoint → Load earlier checkpoint

**Model not learning preferences (DPO/RLHF):**
1. Check reward margin is increasing
2. Verify dataset has clear preferences
3. Increase DPO beta (try 0.2 or 0.5)
4. Check implicit reward accuracy
5. Ensure preference pairs are consistent

---
