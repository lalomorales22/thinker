# How to use Thinker

A friendly, no-jargon guide to fine-tuning your own AI. You don't need a machine-
learning background — Thinker explains every step, and **Demo mode** lets you
practice the whole flow with no API key and no cost.

---

## The 3-step flow

### 1. Add your data → the **Data** tab
Your dataset is just a set of examples the model learns from. Three ways to add it:

- **Upload a file** — `.jsonl`, `.json`, or `.csv`.
- **Create by hand** — type a few examples right in the app (great for a first try).
- **Import from Hugging Face** — search the Hub, map the columns, and import. The
  dataset lands in your list ready to train.

Thinker checks your data against the training type and shows **Ready to train** or
tells you exactly what's missing.

**What each training type needs:**

| Method | Each row needs | Use it when |
|---|---|---|
| **Supervised** | `prompt` + `completion` | You have good example answers. |
| **Preference (DPO)** | `prompt` + `chosen` + `rejected` | It's easier to compare two answers than write the perfect one. |
| **Reinforcement (RL)** | `prompt` (+ optional `reference`) | Good answers are hard to write but easy to score. |

Common column names are auto-detected (e.g. `input`/`output`, `instruction`/
`response`, `question`/`answer`, or a `messages` chat list).

### 2. Train it → the **Train** tab
1. Pick **what you want to teach** (Supervised / Preference / Reinforcement).
2. Choose **your data** and a **base model** (start with `Qwen3.5-4B` — small, fast,
   cheap). The model card shows its price, context window, and whether it supports
   vision.
3. Leave the **settings** on their smart defaults, or open *Advanced* to tweak them.
4. Press **Start** — the right-hand panel shows a live loss curve and status.

No Tinker key yet? **Demo mode** is on by default and previews the flow without
training or cost.

### 3. Try it out → the **Playground** tab
Chat with your fine-tuned model, or **compare** it against the base model side by
side. Give each reply a 👍 or 👎 — those ratings become a preference dataset you can
train on with DPO. That's the feedback loop that keeps improving your model.

Other tabs: **Models** (your trained models + the full base-model catalog),
**Analytics** (real metrics from your runs), and **Arena** (multi-agent RL).

---

## Glossary — training terms in plain English

- **Base model** — the model you start from. Small ones (Qwen3.5-4B) are cheap and
  fast; bigger ones are more capable but cost more per step.
- **Supervised learning (SL)** — teach by example; the model imitates your answers.
- **Preference / DPO** — teach what's *better* from chosen-vs-rejected pairs.
- **Reinforcement learning (RL)** — the model tries answers, gets a **reward**, and
  learns to score higher.
- **LoRA** — a lightweight fine-tune that adds a small adapter instead of changing the
  whole model, so it's fast and cheap.
- **LoRA rank** — how much new capacity you add. 16–32 is a great default.
- **Learning rate** — how big each learning step is. `1e-4` for supervised, `1e-5`
  for DPO/RL. Too high = unstable; too low = slow.
- **Steps** — how many update rounds. More = more learning, more cost. Watch the loss:
  once it flattens, extra steps rarely help.
- **Batch size** — how many examples per step. 2–4 is fine for most fine-tunes.
- **Loss** — how wrong the model is. Lower is better; you want it trending **down**.
  A rising or spiking loss usually means the learning rate is too high.
- **Reward** — a score for how good an answer is (RL). You decide what "good" means.
- **Context window** — how much text the model can consider at once (in tokens).
- **Checkpoint** — a saved snapshot of your model, used to run it or resume training.

Every one of these has a **?** tooltip right next to it in the app.

---

## Do I need anything installed?

- **Just exploring?** No — use **Demo mode**.
- **Training for real?** A [Tinker](https://tinker-docs.thinkingmachines.ai/) API key
  (add it in **Settings**) and the `tinker` + `tinker_cookbook` packages from
  `backend/requirements.txt`.
- **Smarter assistant?** Run [Ollama](https://ollama.ai) locally — see
  [OLLAMA_SETUP.md](OLLAMA_SETUP.md). Without it, the assistant uses a simple built-in
  helper.

## Troubleshooting

- **"No Tinker API key"** — add it in Settings, or flip on Demo mode.
- **A job says "Failed"** — read the reason shown on the job; Thinker surfaces the
  real error instead of hiding it. Common causes: dataset doesn't match the training
  type, or the Tinker SDK isn't installed.
- **Loss isn't going down** — lower the learning rate, or check that your examples are
  consistent and correctly formatted (use *Preview* on the dataset).
