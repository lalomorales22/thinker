# 🎓 Thinker Training Guide

**From Zero to Production: A Complete Guide to Training AI Models**

---

## Table of Contents

1. [Your First Training Job](#your-first-training-job)
2. [Choosing the Right Training Type](#choosing-the-right-training-type)
3. [Dataset Preparation](#dataset-preparation)
4. [Hyperparameter Configuration](#hyperparameter-configuration)
5. [Monitoring Training](#monitoring-training)
6. [Evaluating Your Model](#evaluating-your-model)
7. [Advanced Topics](#advanced-topics)
8. [Production Deployment](#production-deployment)
9. [Common Pitfalls & Solutions](#common-pitfalls--solutions)

---

## Your First Training Job

### Step 1: Understand Your Task

Before training, answer these questions:

**What do I want the model to do?**
- Review code and suggest improvements?
- Answer questions about a specific domain?
- Generate creative content?
- Classify or categorize inputs?

**What data do I have?**
- Perfect examples (input → correct output)?
- Scored examples (input → output → quality score)?
- Preference pairs (output A is better than output B)?
- Nothing yet (need to collect)?

**How will I evaluate success?**
- Accuracy on test set?
- Human evaluation?
- Task-specific metrics (pass rate, user satisfaction)?

### Step 2: Choose Training Type

Use this decision flowchart:

```
Do you have perfect examples?
  YES → Use Supervised Learning (SL)
  NO ↓

Can you score outputs with a function?
  YES → Use Reinforcement Learning (RL)
  NO ↓

Do you have preference pairs (A better than B)?
  YES → Use DPO or RLHF
  NO → Collect data first
```

**Example scenarios:**

| Task | Data Available | Best Approach |
|------|---------------|---------------|
| Code review | 500 code + review pairs | SL |
| Python linter | Pass/fail test results | RL |
| Content moderation | Human ratings (A > B) | DPO |
| Creative writing | User thumbs up/down | RLHF |

### Step 3: Prepare Your Dataset

**Minimum requirements:**
- SL: 100+ examples (500+ recommended)
- RL: 50+ tasks with reward function
- DPO/RLHF: 500+ preference pairs (1000+ recommended)

**Format your data:**

**For SL (Supervised Learning):**
```jsonl
{"prompt": "Review this code: def add(a,b): return a+b", "completion": "Good function! Consider adding type hints."}
{"prompt": "Review this code: x=1+1", "completion": "Use descriptive variable names instead of 'x'."}
```

**For RL (Reinforcement Learning):**
```jsonl
{"prompt": "Write a function to check if number is prime", "reward_function": "test_pass_rate"}
{"prompt": "Optimize this algorithm", "reward_function": "execution_time"}
```

**For DPO/RLHF (Preference Learning):**
```jsonl
{"prompt": "Review: def hello(): print('hi')", "chosen": "Good! Follows PEP 8.", "rejected": "Bad function."}
{"prompt": "Review: x=1", "chosen": "Use better names.", "rejected": "This is perfect!"}
```

### Step 4: Configure Training

**Start with safe defaults:**

| Parameter | Small Dataset (<100) | Medium (100-1K) | Large (>1K) |
|-----------|---------------------|-----------------|-------------|
| **LoRA Rank** | 16 | 32 | 64 |
| **Learning Rate** | 3e-4 | 1e-4 | 5e-5 |
| **Batch Size** | 1-2 | 4 | 8-16 |
| **Training Steps** | 500 | 1000 | 2000-5000 |
| **Warmup Steps** | 50 | 100 | 200 |

**Base model selection:**

| Task Type | Recommended Model | Why |
|-----------|------------------|-----|
| Code | Qwen/Qwen3-8B | Excellent code understanding |
| General text | meta-llama/Llama-3-8B | Strong general capabilities |
| Chat | mistralai/Mistral-7B | Good instruction following |
| Specialized | Fine-tune from similar model | Transfer learning |

### Step 5: Start Training

1. Go to **Training Dashboard** (⚡)
2. Click **"Deploy New Job"**
3. Fill in configuration:
   - Job Name: `my-first-model-v1`
   - Base Model: `Qwen/Qwen3-8B`
   - Training Type: `SL`
   - Use recommended hyperparameters above
4. Select your dataset
5. Click **"Deploy Job"**

### Step 6: Monitor Progress

**What to watch:**

1. **Loss** (most important):
   - Should steadily decrease
   - Start: ~2.0, Target: <0.5
   - If increasing: STOP and reduce learning rate

2. **GPU Utilization**:
   - Target: 80-95%
   - Low (<50%): Increase batch size
   - 100%: Perfect!

3. **Training Speed**:
   - Note steps/second
   - Calculate: `time_left = (total_steps - current) / steps_per_sec`

4. **Checkpoints**:
   - Saved every 500 steps
   - Test intermediate checkpoints
   - Keep best 3 checkpoints

### Step 7: Evaluate Results

**In Playground:**
1. Go to **Playground** (💬)
2. Select your trained model
3. Test with examples NOT in training data
4. Compare against base model

**Evaluation checklist:**
- [ ] Model produces relevant outputs
- [ ] Better than base model
- [ ] Handles edge cases
- [ ] No hallucinations or gibberish
- [ ] Generalizes beyond training data

**Quantitative evaluation:**
- Test set loss < training loss (not overfitting)
- Accuracy/F1 score on held-out test set
- Human evaluation on sample outputs

---

## Choosing the Right Training Type

### Decision Matrix

| Criterion | SL | RL | RLHF | DPO |
|-----------|----|----|------|-----|
| **Data needed** | Input-output pairs | Reward function | Preference pairs | Preference pairs |
| **Data amount** | 100-500 | 50-200 | 500-1000 | 500-1000 |
| **Training time** | Fast (1-2 hrs) | Medium (2-4 hrs) | Slow (4-8 hrs) | Medium (2-4 hrs) |
| **Complexity** | Simple | Medium | Complex | Medium |
| **Stability** | High | Medium | Low | High |
| **Quality** | Good | Variable | Excellent | Excellent |

### When to Use Each

**Supervised Learning (SL):**
✅ Use when:
- You have correct examples
- Task has clear right answers
- You want fast, stable training

❌ Don't use when:
- Examples are subjective
- Multiple valid answers exist
- You can't create perfect examples

**Reinforcement Learning (RL):**
✅ Use when:
- You can score outputs programmatically
- Want to optimize for specific metric
- Multiple solutions exist

❌ Don't use when:
- Reward function is hard to define
- Training instability is unacceptable
- You have perfect examples (use SL instead)

**RLHF:**
✅ Use when:
- You have human preferences
- Need reward model for other tasks
- Quality is critical

❌ Don't use when:
- Limited time/resources (use DPO)
- Small dataset (<500 pairs)
- Training instability is problematic

**DPO:**
✅ Use when:
- You have preference pairs
- Want simpler training than RLHF
- Need stable, reliable results

❌ Don't use when:
- You need a reward model separately
- You have perfect examples (use SL)

---

## Dataset Preparation

### Data Collection

**For Supervised Learning:**
1. Collect input-output pairs
2. Ensure outputs are high quality
3. Cover diverse scenarios
4. Include edge cases

**Quality > Quantity:**
- 100 excellent examples > 1000 mediocre ones
- Consistent formatting is critical
- Validate correctness manually

**For Preference Learning (DPO/RLHF):**
1. Generate multiple outputs per prompt
2. Have humans rank or compare
3. Ensure clear differences between chosen/rejected
4. Maintain consistency across labelers

**Labeling guidelines:**
- Clear criteria for "better"
- Multiple annotators per example
- Measure inter-annotator agreement
- Discard ambiguous pairs

### Data Formatting

**JSONL (recommended for large datasets):**
```jsonl
{"prompt": "...", "completion": "..."}
{"prompt": "...", "completion": "..."}
```

**JSON (easier to edit):**
```json
[
  {"prompt": "...", "completion": "..."},
  {"prompt": "...", "completion": "..."}
]
```

**CSV (simple data):**
```csv
prompt,completion
"Review this code","Good function"
```

### Data Validation

**Checklist:**
- [ ] Valid JSON/JSONL/CSV format
- [ ] All required fields present
- [ ] No empty values
- [ ] Consistent field names
- [ ] Proper encoding (UTF-8)
- [ ] No duplicate examples
- [ ] Balanced distribution

**Use Dataset Validator:**
1. Upload to Dataset Manager
2. Preview first 5 examples
3. Check statistics (length, distribution)
4. Fix any errors before training

### Data Splitting

**Standard splits:**
- **Train**: 80% (model learns from this)
- **Validation**: 15% (check overfitting)
- **Test**: 5% (final evaluation)

**Small datasets (<500 examples):**
- Train: 70%
- Validation: 20%
- Test: 10%

**Why validation matters:**
- Detects overfitting early
- Guides when to stop training
- Prevents training on test data

---

## Hyperparameter Configuration

### Core Hyperparameters

**LoRA Rank**
- **What**: Number of trainable parameters
- **Options**: 8, 16, 32, 64, 128, 256
- **Recommendation**:
  - Small dataset: 16-32
  - Medium dataset: 32-64
  - Large dataset: 64-128
- **Tradeoff**: Higher = better quality but slower

**Learning Rate**
- **What**: Step size for optimization
- **Recommendation**:
  - Start with 1e-4
  - Halve if training unstable
  - Double if too slow
- **Schedules**:
  - Constant: Same throughout (simple)
  - Cosine: Gradual decay (best)
  - Linear warmup + decay (stable)

**Batch Size**
- **What**: Examples per training step
- **Recommendation**: Largest that fits in GPU memory
- **Typical**: 4-8 for most setups
- **Tradeoff**: Larger = faster but needs more memory

**Training Steps**
- **What**: How long to train
- **Recommendation**:
  - Testing: 100-500 steps
  - Standard: 1000-2000 steps
  - Thorough: 5000-10000 steps
- **Rule of thumb**: 2-5 epochs over dataset

### Training Type-Specific Settings

**For RL:**
- **KL Penalty**: 0.01-0.1 (prevents drift)
- **Entropy Bonus**: 0.01 (encourages exploration)
- **Value Coefficient**: 0.5 (baseline estimation)

**For DPO:**
- **Beta**: 0.1 (default), higher = stronger preferences
- **Reference Model**: Same as base model
- **Label Smoothing**: 0.0 (default)

**For RLHF:**
- **Reward Model Steps**: 1000-2000
- **RL Steps**: 5000-10000
- **PPO Epochs**: 4
- **KL Target**: 0.01

### Hyperparameter Tuning

**Systematic approach:**
1. Start with defaults
2. Train for 500 steps
3. Evaluate results
4. Adjust ONE parameter at a time
5. Repeat

**Parameter priority:**
1. Learning rate (most impactful)
2. LoRA rank (quality vs. speed)
3. Batch size (speed vs. stability)
4. Training steps (underfitting vs. overfitting)

**Grid search (advanced):**
```python
learning_rates = [1e-5, 5e-5, 1e-4, 5e-4]
lora_ranks = [16, 32, 64]
batch_sizes = [4, 8]

# Try all combinations, pick best on validation set
```

---

## Monitoring Training

### Key Metrics to Watch

**Loss (all training types):**
- **Healthy**: Steadily decreasing
- **Warning**: Plateaued for >200 steps
- **Critical**: Increasing or spiking

**GPU Utilization:**
- **Target**: 80-95%
- **Low**: Increase batch size
- **High**: Good!

**Learning Rate:**
- **Check**: Current vs. scheduled
- **Adaptive**: Adjust based on loss

**Gradient Norm:**
- **Healthy**: 0.1-10.0
- **Warning**: >100 (exploding)
- **Critical**: <0.01 (vanishing)

### Real-Time Dashboard

**Monitor in Training Dashboard:**
1. Expandable job cards
2. Live loss curves
3. Progress bars
4. Recent logs
5. Estimated time remaining

**Terminal Console:**
- Detailed step-by-step logs
- Error messages
- WebSocket updates
- API responses

### When to Intervene

**Stop training if:**
- Loss increasing for >50 steps
- Model outputs gibberish
- GPU errors or OOM
- Gradient explosion (norm >1000)

**Checkpoint and restart if:**
- Need to adjust learning rate
- Want to try different hyperparameters
- Training instability detected

**Continue training if:**
- Loss decreasing (even slowly)
- Metrics improving
- No errors in logs

---

## Evaluating Your Model

### Qualitative Evaluation

**In Playground:**
1. Test on examples NOT in training data
2. Try edge cases and unusual inputs
3. Compare to base model side-by-side
4. Check for:
   - Relevance
   - Correctness
   - Coherence
   - No hallucinations

**Blind comparison:**
- Generate outputs from base + trained model
- Ask others to rate without knowing which is which
- Calculate win rate

### Quantitative Evaluation

**Test set metrics:**
- **Loss**: Should be similar to validation loss
- **Accuracy**: For classification tasks
- **F1 Score**: For imbalanced data
- **BLEU/ROUGE**: For generation tasks

**RL metrics:**
- **Average Reward**: Higher than baseline
- **Task Success Rate**: % of successful completions
- **Pareto Improvement**: Better without worse elsewhere

**Preference metrics (DPO/RLHF):**
- **Win Rate**: >60% vs. base model
- **Elo Rating**: If running tournaments
- **Human Evaluation**: Gold standard

### A/B Testing

**Production setup:**
1. Deploy base model (control)
2. Deploy trained model (treatment)
3. Route 50% traffic to each
4. Measure:
   - User satisfaction
   - Task completion
   - Engagement metrics
5. Choose winner based on data

### Regression Testing

**Check that model:**
- Still handles basic cases
- Didn't forget capabilities
- Maintains safety guardrails
- No new failure modes

---

## Advanced Topics

### Curriculum Learning

**Concept**: Start easy, gradually increase difficulty

**Implementation:**
1. Sort dataset by difficulty
2. Train on easy examples first
3. Gradually add harder examples
4. Monitor performance on hard examples

**Example:**
```
Steps 0-500: Simple code reviews
Steps 500-1000: Medium complexity
Steps 1000-2000: Advanced patterns
Steps 2000+: Edge cases
```

**Benefits:**
- Faster convergence
- Better final performance
- More stable training

### Multi-Task Training

**Concept**: Train on multiple related tasks simultaneously

**Implementation:**
1. Mix datasets from different tasks
2. Use task-specific prefixes
3. Adjust loss weights by task
4. Monitor per-task metrics

**Example:**
```jsonl
{"task": "review", "prompt": "...", "completion": "..."}
{"task": "explain", "prompt": "...", "completion": "..."}
{"task": "fix", "prompt": "...", "completion": "..."}
```

**Benefits:**
- Better generalization
- Shared knowledge across tasks
- More efficient use of model capacity

### Transfer Learning

**Concept**: Start from similar pre-trained model

**Implementation:**
1. Find model trained on similar task
2. Use as base model
3. Train with lower learning rate
4. Fewer steps needed

**Example:**
```
Base: General code model
→ Fine-tune: Python-specific
→ Fine-tune: Python security review
```

**Benefits:**
- Faster training
- Better performance with less data
- Builds on existing knowledge

### Continual Learning

**Concept**: Keep improving model over time

**Implementation:**
1. Collect new data from production
2. Periodically re-train
3. Use replay buffer to prevent forgetting
4. Validate on old test set

**Schedule:**
- Weekly: For high-volume applications
- Monthly: For standard applications
- Quarterly: For slow-changing domains

**Challenges:**
- Catastrophic forgetting (use replay)
- Distribution shift (monitor metrics)
- Version management (track lineage)

### Hyperparameter Optimization

**Bayesian Optimization:**
1. Define search space
2. Run initial random trials
3. Model performance landscape
4. Sample promising regions
5. Iterate until convergence

**Tools:**
- Optuna
- Ray Tune
- Weights & Biases Sweeps

**Search space example:**
```python
{
  "learning_rate": [1e-5, 5e-4],  # log scale
  "lora_rank": [16, 32, 64, 128],
  "batch_size": [4, 8, 16],
  "warmup_steps": [50, 100, 200]
}
```

---

## Production Deployment

### Pre-Deployment Checklist

- [ ] Model evaluated on diverse test set
- [ ] A/B tested against baseline
- [ ] Latency acceptable (<500ms)
- [ ] Memory footprint reasonable
- [ ] No safety issues or biases
- [ ] Fallback plan if model fails
- [ ] Monitoring and logging in place
- [ ] Version tracking enabled

### Deployment Strategies

**Canary Deployment:**
1. Deploy to 5% of traffic
2. Monitor for issues
3. Gradually increase to 100%
4. Rollback if problems

**Blue-Green Deployment:**
1. Keep old model running (blue)
2. Deploy new model (green)
3. Switch traffic instantly
4. Keep blue as backup

**Shadow Deployment:**
1. Run new model alongside old
2. Log outputs but don't show users
3. Compare outputs offline
4. Deploy when confident

### Monitoring in Production

**Track metrics:**
- Request latency (p50, p95, p99)
- Error rate
- Model prediction distribution
- User satisfaction (thumbs up/down)
- Task completion rate

**Set alerts:**
- Latency >500ms for >1% requests
- Error rate >0.1%
- Sudden distribution shift
- User satisfaction drop >10%

**Log everything:**
- All inputs and outputs
- Model version used
- Latency per request
- User feedback
- Errors and exceptions

### Model Versioning

**Naming scheme:**
```
model-name-v1.0.0
- v1: Major changes (architecture)
- v1.1: Minor changes (new training data)
- v1.1.1: Patches (bug fixes)
```

**Metadata to track:**
- Training dataset version
- Hyperparameters used
- Base model
- Training date
- Performance metrics
- Changelog

### Scaling Considerations

**Horizontal scaling:**
- Deploy multiple model instances
- Load balance requests
- Share nothing architecture

**Optimization:**
- Quantization (INT8, FP16)
- Distillation (smaller model)
- Pruning (remove weights)
- Caching (common inputs)

---

## Common Pitfalls & Solutions

### Training Issues

**Problem**: Loss not decreasing
**Causes**:
- Learning rate too low
- Dataset too small
- Task too hard for model size
**Solutions**:
- Increase learning rate by 2-5x
- Collect more data
- Use larger base model

**Problem**: Loss increasing
**Causes**:
- Learning rate too high
- Bad data batch
- Gradient explosion
**Solutions**:
- Reduce learning rate by 10x
- Check dataset for errors
- Enable gradient clipping

**Problem**: Training very slow
**Causes**:
- Batch size too small
- LoRA rank too high
- Inefficient data loading
**Solutions**:
- Increase batch size
- Reduce LoRA rank
- Optimize dataset preprocessing

**Problem**: GPU out of memory
**Causes**:
- Batch size too large
- Model too large
- Memory leak
**Solutions**:
- Reduce batch size by half
- Reduce LoRA rank
- Restart training process

### Data Issues

**Problem**: Model overfits (test loss >> train loss)
**Causes**:
- Dataset too small
- Trained too long
- Model too large
**Solutions**:
- Collect more data
- Early stopping based on validation loss
- Reduce LoRA rank

**Problem**: Model underfits (both losses high)
**Causes**:
- Model too small
- Not trained long enough
- Learning rate too low
**Solutions**:
- Increase LoRA rank
- Train longer
- Increase learning rate

**Problem**: Inconsistent results
**Causes**:
- Data formatting issues
- Contradictory examples
- Ambiguous labels
**Solutions**:
- Validate data format
- Remove contradictions
- Clarify labeling guidelines

### Model Issues

**Problem**: Model outputs gibberish
**Causes**:
- KL divergence too high (RL/RLHF)
- Learning rate too high
- Training corrupted
**Solutions**:
- Increase KL penalty
- Reduce learning rate
- Load earlier checkpoint

**Problem**: Model doesn't generalize
**Causes**:
- Overfitting
- Dataset not diverse
- Test set different from train
**Solutions**:
- More data augmentation
- Collect diverse examples
- Check data distribution

**Problem**: Model forgets base knowledge
**Causes**:
- Too much fine-tuning
- Dataset too narrow
- Learning rate too high
**Solutions**:
- Reduce training steps
- Mix in general examples
- Lower learning rate

---

## Quick Reference

### Training Type Decision Tree

```
START
  ↓
Do you have labeled data?
  NO → Can you write reward function?
    YES → Use RL
    NO → Can you collect preferences?
      YES → Use DPO
      NO → Collect labeled data first
  YES ↓
Are labels perfect examples?
  YES → Use SL
  NO → Are they preferences (A > B)?
    YES → Use DPO
    NO → Convert to SL format or collect preferences
```

### Hyperparameter Quick Reference

| Dataset Size | LoRA Rank | LR | Batch | Steps |
|--------------|-----------|-----|-------|-------|
| <100 | 16 | 3e-4 | 2 | 500 |
| 100-500 | 32 | 1e-4 | 4 | 1000 |
| 500-2K | 64 | 5e-5 | 8 | 2000 |
| 2K-10K | 128 | 3e-5 | 16 | 5000 |
| >10K | 256 | 1e-5 | 32 | 10000 |

### Troubleshooting Cheatsheet

| Symptom | Likely Cause | Quick Fix |
|---------|-------------|-----------|
| Loss increasing | LR too high | Divide LR by 10 |
| Loss not decreasing | LR too low | Multiply LR by 3 |
| Training slow | Batch too small | Double batch size |
| GPU OOM | Batch too large | Halve batch size |
| Model gibberish | KL too high | Increase KL penalty |
| Overfitting | Too many steps | Early stopping |
| Underfitting | Too few steps | Train longer |

---

## Additional Resources

### Documentation
- [HOW_TO_USE.md](HOW_TO_USE.md) - Interface guide
- [BUILD.md](BUILD.md) - Vision and roadmap
- [Tinker SDK Docs](https://tinker-docs.thinkingmachines.ai/)

### Papers
- [LoRA: Low-Rank Adaptation](https://arxiv.org/abs/2106.09685)
- [RLHF: Learning to summarize](https://arxiv.org/abs/2009.01325)
- [DPO: Direct Preference Optimization](https://arxiv.org/abs/2305.18290)
- [PPO: Proximal Policy Optimization](https://arxiv.org/abs/1707.06347)

### Community
- Tinker Discord (coming soon)
- Thinker GitHub Issues
- Thinking Machines Lab Blog

---

**Happy Training!** 🚀

Remember: Start simple, iterate quickly, and let the data guide you.
