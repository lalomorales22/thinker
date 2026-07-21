# 🧠 Thinker

**Fine-tune your own AI — the friendly way.**

Thinker is a studio for fine-tuning open language models with the
[Tinker](https://tinker-docs.thinkingmachines.ai/) training API. Bring your data,
pick a model, press start. Every setting is explained in plain English, and a
built-in **Demo mode** lets you try the whole flow with no API key and no cost.

---

## What you can do

- **Add data three ways** — upload a file (`.jsonl` / `.json` / `.csv`), type
  examples by hand, or import a dataset straight from **Hugging Face**. Thinker
  validates it against the training type and tells you exactly what to fix.
- **See inside a file before importing it** — uploading runs
  **inspect → map → preview → commit**. Thinker reads the file into a staging
  area and reports what it found: the columns, which training type it can feed,
  and the *actual converted examples* a field mapping would produce. Nothing is
  written to your dataset list until you've seen it, and backing out discards
  the staged copy.
- **Credential scanning, before anything leaves your machine** — training data
  is uploaded to Tinker, and whatever a model memorises can resurface in its
  output later. So every ingest is scanned for API keys, tokens, private keys
  and passwords. Findings are shown **redacted**, with a choice of redacting
  them, dropping those rows, or importing as-is. It's tuned for precision over
  recall — a scanner that cries wolf gets ignored — so it passes over things
  like `api_key = your-api-key-here`.
- **Find a dataset without guessing** — the Hugging Face importer opens on a
  goal-first shortlist ("make it follow instructions", "match my tone"), and
  every suggestion *and* search result is checked live against the Hub before
  you commit: **trains as-is**, **partly usable**, or **needs field mapping**,
  with the detected columns shown. It catches real traps — e.g. `Anthropic/hh-rlhf`
  bakes the prompt into the chosen/rejected text, so it can't feed DPO unmapped.
- **Train for real** — three genuinely-implemented methods:
  - **Supervised** — teach by example (prompt → answer).
  - **Preference (DPO)** — teach what's *better* (chosen vs. rejected), via a real
    Bradley-Terry loss.
  - **Reinforcement (RL)** — teach by trying, with a real `importance_sampling`
    policy-gradient loop over sampled rollouts.
- **Watch it learn** — live loss/reward curves stream over WebSocket while the job
  runs. If something goes wrong, the job **fails with the real reason** — Thinker
  never fakes a success.
- **Try your model** — chat with it in the Playground, compare base vs. fine-tuned
  side by side, and turn 👍/👎 ratings into a preference dataset (closing the RLHF
  loop).
- **Multi-agent Arena** — spin up several copies of a model and let them compete
  with real RL (tournament or evolutionary "swarm"), ranked on a live leaderboard.
- **Live model catalog** — the current Tinker base models with real pricing,
  context windows, and vision/reasoning badges (fetched from Tinker, not hardcoded).
- **Export it to run on a phone** — Tinker keeps a fine-tune as a LoRA adapter in
  its own storage. The **Export** page turns that into one set of merged,
  quantized weights in **MLX** format, the one Apple Silicon and iOS run natively
  (`weights.download` → `weights.build_hf_model` → `mlx_lm.convert -q`).

  It preflights first, because merging loads the full base model in bf16 — a 4B
  fine-tune means an ~8 GB download and ~9 GB of RAM, a 20B one means ~40 GB and
  ~46 GB. So before downloading anything it answers two questions: **will the
  result fit on a phone** (sizes at 4/6/8/16-bit against real iPhone memory
  budgets), and **can this machine actually do the conversion** (disk, RAM,
  Apple Silicon, mlx-lm). A job this machine can't finish is refused up front
  rather than dying halfway through.

  The numbers are deliberately unflattering: iOS only lets an app address part
  of physical RAM, so a 12 GB phone is not a 12 GB budget, and sizes include
  ~10% runtime headroom. Worth checking *before* you pick a base model — a 20B
  MoE is ~11 GB at 4-bit and fits no iPhone at any quantization, because every
  expert stays resident even when few are active.

## Architecture

**Backend** (`/backend`) — FastAPI + SQLite (persists datasets, models, jobs, and
per-step metrics). A real Tinker training engine (`training/engine.py`), a live
model catalog (`catalog.py`), HuggingFace import wired straight into training, and a
WebSocket hub for live updates. Tinker imports are lazy, so the app boots and all
non-training features work without the SDK installed.

Shared data logic lives in `training/datautil.py` — schema validation, field
mapping, and the "will this actually train?" fit check are written once and used
by every importer, so the local-file and HuggingFace paths can't drift apart.
`training/secrets.py` is the credential scanner, and `routes/export.py` handles
the MLX export and its preflight.

**Frontend** (`/frontend`) — React 18 + TypeScript + Vite + Tailwind. A friendly
"studio" design system (black / orange / white), a plain-language glossary with
tooltips on every training term, and Recharts for real loss/reward curves.

Views recover from backend outages on their own: failed requests retry with a
backoff, and when the live WebSocket reconnects, any view still showing an error
refetches. Reloading the page is not the fix.

## Quick start

```bash
./START_UI.sh
```

This creates the backend virtualenv, installs dependencies, and launches both
servers. Then open **http://localhost:5173**.

The script re-checks the Python dependencies on every run (not just when it
first creates `.venv`), so an interrupted install can't leave you with a venv
that exists but can't start. First run pulls PyTorch and the Tinker SDK, so
expect a few minutes.

<details>
<summary>Manual setup</summary>

```bash
# Backend — use Python 3.11–3.13 (the Tinker SDK isn't ready for 3.14+ yet)
cd backend
python3.12 -m venv .venv && ./.venv/bin/pip install -r requirements.txt

# Exclude storage/ and logs/ from the reloader: the app writes its SQLite DB,
# datasets, and logs into this directory, and a plain --reload would restart
# the server every time a training step records a metric.
./.venv/bin/python -m uvicorn main:app --port 8000 \
  --reload --reload-dir . \
  --reload-exclude 'storage/*' --reload-exclude 'logs/*' \
  --reload-exclude '*.db' --reload-exclude '*.log'

# Frontend (in another terminal)
cd frontend
npm install && npm run dev
```
</details>

## Do I need an API key?

- **To explore / learn:** no. **Demo mode** runs a realistic, clearly-labeled
  practice run (it never saves a model or spends anything).
- **To train or chat for real:** yes — a
  [Tinker](https://tinker-docs.thinkingmachines.ai/) API key. Add it in **Settings**.
  Real training also needs the `tinker` + `tinker_cookbook` Python packages
  (installed from `requirements.txt`).
- **Optional:** [Ollama](https://ollama.ai) running locally makes the in-app
  training assistant conversational (otherwise it uses a simple built-in helper).

## Troubleshooting

**"Can't reach the Thinker backend at http://localhost:8000"**

The backend isn't running (or isn't up yet). The message is literal, not a UI
glitch — if you see it on several pages at once, check the backend, not the app.

Thinker recovers on its own: failed requests retry with a backoff, and when the
live WebSocket reconnects, any view still showing an error refetches. You should
not have to reload the page. Confirm the backend directly with:

```bash
curl http://localhost:8000/api/health
```

**Backend exits with `No module named uvicorn`**

`backend/.venv` exists but is empty. Older versions of `START_UI.sh` only
installed dependencies when *creating* the venv, so an interrupted first run
left it unusable. The current script detects this; to fix it by hand:

```bash
cd backend && ./.venv/bin/python -m pip install -r requirements.txt
```

**Port 8000 or 5173 already in use**

An earlier run is still alive: `pkill -f 'uvicorn main:app'` and `pkill -f vite`.

**The Models page looks empty**

"Your models" only lists models *you've* trained, so it's empty until your first
run finishes. The 24 base models are under **Model catalog** — the page opens
there automatically until you have models of your own.

**Hugging Face search returns an error**

Search needs `huggingface-hub`, and the API changed in 1.x. If you're on a
pinned older version, reinstall from `requirements.txt`.

**Export says "this machine can't complete the export"**

Working as intended — it checked before downloading. The usual blocker is disk:
merging needs roughly 2.3× the base model's bf16 size (a 20B model wants ~92 GB).
Free space up, or export a smaller base model. "RAM to merge" is a *warning*, not
a blocker — it will still run, but it will swap and take considerably longer.

**Export: "mlx-lm isn't installed"**

Expected on a first run; the export installs it. MLX is Apple Silicon only, so
the Export page won't work on an Intel Mac.

**My upload says "needs field mapping"**

Your columns aren't ones Thinker recognises (`prompt`/`completion`, or aliases
like `instruction`/`response`). Use the mapping step to point each required
field at the right column — the preview updates live, so you can see the real
training examples before importing.

**A training run needs a real key**

Demo mode needs nothing. Real runs need a Tinker key in **Settings** — but note
it's stored in your browser and sent per request, so it applies to *that browser
only*. Anything not driven from your browser session (a `curl` check, a
background job) will see no key and get a 401.

To make the key available server-side, copy `.env.example` to `.env` in the repo
root and set `TINKER_API_KEY` there. `/api/health` reports `tinker_api_key` for
whichever source applies to that request.

## Docs

- **[HOW_TO_USE.md](HOW_TO_USE.md)** — a friendly walkthrough + glossary of training terms.

## License

MIT
