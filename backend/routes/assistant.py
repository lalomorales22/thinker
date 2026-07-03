"""
AI Training Assistant — a natural-language helper (Ollama-backed).

Improvements over the old version:
- Knows the app is a general fine-tuning studio and only the training types that
  actually work (sl / dpo / rl), with current model ids and renderer names.
- Injects the user's REAL context (their datasets, trained models, the
  recommended default model) into the prompt so advice is grounded.
- Parses a fenced ```config block from the model into a suggested config the UI
  can apply — but NEVER claims to have created a job. Creating a job is an
  explicit user action through the training endpoint.
- When Ollama isn't running it says so and still gives a useful heuristic
  suggestion, instead of pretending to be a large model.
"""
from __future__ import annotations

import json
import re
from typing import Any, Optional

import httpx
from fastapi import APIRouter
from pydantic import BaseModel, Field

import catalog
import db
from config import OLLAMA_MODEL, OLLAMA_URL

router = APIRouter()

SYSTEM_PROMPT = """You are the training assistant inside "Thinker", a friendly studio for fine-tuning open LLMs with the Tinker API.

Help the user pick an approach, prepare data, and choose settings. Be concise, encouraging, and plain-spoken — assume the user is smart but new to fine-tuning. Explain jargon in one line the first time you use it.

Only THREE training types actually work in this app — never suggest anything else:
- "sl"  Supervised learning: teach by example. Data = prompt + the exact answer you want (or a messages chat list). Best when you have good example answers.
- "dpo" Preference optimization: teach what's better. Data = prompt + a "chosen" answer + a "rejected" answer. Best for tone/style/quality from comparisons.
- "rl"  Reinforcement learning: teach by trying. Data = prompts (+ optional reference answer); the model samples answers, gets a reward, and improves. Best when good answers are hard to write but easy to score.

Settings you can recommend (with plain-language reasons):
- base_model: a current model id from the catalog (default Qwen/Qwen3.5-4B — small, fast, cheap, good for first runs).
- rank (LoRA rank): how much new capacity to add. 16–32 is a great default.
- learning_rate: step size. 1e-4 for SL; 1e-5 for DPO/RL (they're more delicate).
- num_steps, batch_size: more steps = more learning but more cost.

When you have enough info to recommend settings, include ONE fenced block exactly like:
```config
{"training_type":"sl","base_model":"Qwen/Qwen3.5-4B","rank":32,"learning_rate":1e-4,"num_steps":200,"batch_size":4}
```
Then tell the user they can press "Use these settings" to load them into the Train screen. Do NOT claim to have started training — the user starts it themselves.
"""


class ChatMessage(BaseModel):
    role: str
    content: str


class AssistantRequest(BaseModel):
    messages: list[ChatMessage]
    context: Optional[dict[str, Any]] = None
    model: Optional[str] = None


class AssistantResponse(BaseModel):
    message: str
    suggested_config: Optional[dict[str, Any]] = None
    source: str = "ollama"                    # ollama | heuristic


def _context_block(context: Optional[dict[str, Any]]) -> str:
    datasets = db.list_datasets()
    models = db.list_models()
    lines = ["Here is the user's current workspace (use it to give grounded advice):"]
    if datasets:
        lines.append("Datasets:")
        for d in datasets[:8]:
            ok = "ok" if d["schema_ok"] else "NEEDS FIXING"
            lines.append(f"  - '{d['name']}' ({d['training_type']}, {d['num_samples']} rows, schema {ok})")
    else:
        lines.append("Datasets: none yet (the user can upload, hand-create, or import from HuggingFace).")
    if models:
        lines.append("Trained models: " + ", ".join(m["id"] for m in models[:8]))
    lines.append(f"Recommended default base model: {catalog.DEFAULT_MODEL}")
    return "\n".join(lines)


_CONFIG_RE = re.compile(r"```config\s*(\{.*?\})\s*```", re.DOTALL)


def _extract_config(text: str) -> Optional[dict[str, Any]]:
    m = _CONFIG_RE.search(text) or re.search(r"```json\s*(\{.*?\"training_type\".*?\})\s*```", text, re.DOTALL)
    if not m:
        return None
    try:
        cfg = json.loads(m.group(1))
    except json.JSONDecodeError:
        return None
    return _normalize_config(cfg)


def _normalize_config(cfg: dict[str, Any]) -> dict[str, Any]:
    tt = str(cfg.get("training_type", "sl")).lower()
    tt = {"supervised": "sl", "preference": "dpo", "rlhf": "dpo", "reinforcement": "rl"}.get(tt, tt)
    if tt not in ("sl", "dpo", "rl"):
        tt = "sl"
    return {
        "training_type": tt,
        "base_model": cfg.get("base_model") or cfg.get("model_name") or catalog.DEFAULT_MODEL,
        "rank": int(cfg.get("rank", 32)),
        "learning_rate": float(cfg.get("learning_rate", 1e-4)),
        "num_steps": int(cfg.get("num_steps", 200)),
        "batch_size": int(cfg.get("batch_size", 4)),
    }


@router.post("/chat", response_model=AssistantResponse)
async def chat(req: AssistantRequest):
    ollama_messages = [{"role": "system", "content": SYSTEM_PROMPT + "\n\n" + _context_block(req.context)}]
    ollama_messages += [{"role": m.role, "content": m.content} for m in req.messages]
    model = req.model or OLLAMA_MODEL

    try:
        async with httpx.AsyncClient(timeout=180.0) as client:
            resp = await client.post(f"{OLLAMA_URL}/api/chat",
                                     json={"model": model, "messages": ollama_messages, "stream": False})
            resp.raise_for_status()
            text = resp.json().get("message", {}).get("content", "").strip()
        if text:
            return AssistantResponse(message=text, suggested_config=_extract_config(text), source="ollama")
    except Exception:
        pass

    return _heuristic(req.messages)


def _heuristic(messages: list[ChatMessage]) -> AssistantResponse:
    """Used when Ollama isn't running — honest and still useful."""
    last = (messages[-1].content if messages else "").lower()
    prefix = ("_(Ollama isn't running, so this is a quick built-in helper. "
              "Start Ollama for smarter, conversational help.)_\n\n")

    def cfg(tt):
        return _normalize_config({"training_type": tt, "base_model": catalog.DEFAULT_MODEL,
                                  "rank": 32, "learning_rate": 1e-4 if tt == "sl" else 1e-5,
                                  "num_steps": 200, "batch_size": 4})

    if any(w in last for w in ("prefer", "chosen", "rejected", "dpo", "better")):
        return AssistantResponse(source="heuristic", suggested_config=cfg("dpo"), message=prefix +
            "Sounds like **preference training (DPO)** — you teach the model which answer is better.\n\n"
            "Your data needs `prompt`, `chosen`, and `rejected` for each row. Press **Use these settings** to load a DPO config.")
    if any(w in last for w in ("reward", "score", "reinforce", "rl ", "by trying")):
        return AssistantResponse(source="heuristic", suggested_config=cfg("rl"), message=prefix +
            "That's **reinforcement learning (RL)** — the model tries answers and learns from a reward.\n\n"
            "Give it `prompt`s (a `reference` answer is optional but helps scoring). Press **Use these settings** for an RL config.")
    if any(w in last for w in ("loss", "not decreasing", "increasing", "nan")):
        return AssistantResponse(source="heuristic", message=prefix +
            "**Reading loss:** it should trend *down*. If it climbs or spikes, your learning rate is likely too high — "
            "try halving it (e.g. 1e-4 → 5e-5). If it's flat, it may be too low, or the data is very hard.")
    return AssistantResponse(source="heuristic", suggested_config=cfg("sl"), message=prefix +
        "The most common starting point is **supervised learning (SL)** — show the model example `prompt`/`completion` "
        "pairs and it learns to imitate them. Press **Use these settings** to load a solid default config, or tell me more "
        "about your task (do you have example answers, comparisons, or just a way to score outputs?).")


@router.get("/status")
async def status():
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{OLLAMA_URL}/api/tags")
            resp.raise_for_status()
            models = [m["name"] for m in resp.json().get("models", [])]
        return {"available": True, "models": models, "default": OLLAMA_MODEL}
    except Exception as e:
        return {"available": False, "models": [], "default": OLLAMA_MODEL, "error": str(e)}


@router.get("/models")
async def models():
    s = await status()
    return {"models": [{"name": n} for n in s["models"]], "available": s["available"]}


class SuggestRequest(BaseModel):
    task_description: str = ""
    num_examples: int = 0
    data_format: str = "supervised"          # supervised | preference | reward


@router.post("/suggest-config")
async def suggest_config(req: SuggestRequest):
    tt = {"preference": "dpo", "reward": "rl"}.get(req.data_format, "sl")
    n = req.num_examples
    if n and n < 100:
        rank, lr, batch, steps = 16, 3e-4, 2, 300
    elif n and n < 1000:
        rank, lr, batch, steps = 32, 1e-4, 4, 500
    elif n and n < 10000:
        rank, lr, batch, steps = 64, 5e-5, 8, 1000
    else:
        rank, lr, batch, steps = 64, 1e-5, 8, 1500
    if tt in ("dpo", "rl"):
        lr = min(lr, 1e-5)
    return _normalize_config({"training_type": tt, "base_model": catalog.DEFAULT_MODEL,
                              "rank": rank, "learning_rate": lr, "num_steps": steps, "batch_size": batch})
