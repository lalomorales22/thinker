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

## Architecture

**Backend** (`/backend`) — FastAPI + SQLite (persists datasets, models, jobs, and
per-step metrics). A real Tinker training engine (`training/engine.py`), a live
model catalog (`catalog.py`), HuggingFace import wired straight into training, and a
WebSocket hub for live updates. Tinker imports are lazy, so the app boots and all
non-training features work without the SDK installed.

**Frontend** (`/frontend`) — React 18 + TypeScript + Vite + Tailwind. A friendly
"studio" design system (black / orange / white), a plain-language glossary with
tooltips on every training term, and Recharts for real loss/reward curves.

## Quick start

```bash
./START_UI.sh
```

This creates the backend virtualenv, installs dependencies, and launches both
servers. Then open **http://localhost:5173**.

<details>
<summary>Manual setup</summary>

```bash
# Backend
cd backend
python3 -m venv .venv && ./.venv/bin/pip install -r requirements.txt
./.venv/bin/python -m uvicorn main:app --reload --port 8000

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

## Docs

- **[HOW_TO_USE.md](HOW_TO_USE.md)** — a friendly walkthrough + glossary of training terms.

## License

MIT
