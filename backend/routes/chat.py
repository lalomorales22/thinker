"""
Playground / inference routes — chat with a base or trained model.

Fixes the old flow that, per message, created a whole LoRA *training* client,
saved weights, blocked the event loop with `future.result()`, and tokenized a
raw "role: content" string. Here we cache a persistent SamplingClient per model,
build the prompt with the model's renderer, and sample asynchronously.

Also hosts the human-feedback loop: 👍/👎 comparisons are stored as preference
pairs that can be turned into a real DPO dataset (closing the RLHF loop the app
used to only pretend to have).
"""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

import db
from config import DATASETS_DIR, get_tinker_api_key
from training import engine
from utils import logger

router = APIRouter()

# Cache: key -> (SamplingClient, renderer, tokenizer)
_samplers: dict[str, tuple] = {}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _get_sampler(model: str, api_key: Optional[str]):
    """Resolve `model` (a trained-model id or a base-model id) to a cached sampler."""
    if model in _samplers:
        return _samplers[model]

    tinker, types, _ = engine.load_sdk()
    if api_key:
        os.environ["TINKER_API_KEY"] = api_key
    service = tinker.ServiceClient()

    trained = db.get_model(model)
    if trained and trained.get("sampler_path"):
        sampling_client = await service.create_sampling_client_async(model_path=trained["sampler_path"])
        base_model = trained["base_model"]
    else:
        base_model = model
        sampling_client = await service.create_sampling_client_async(base_model=base_model)

    tokenizer = sampling_client.get_tokenizer()
    renderer, _name = engine.build_renderer(base_model, tokenizer)
    entry = (sampling_client, renderer, tokenizer)
    _samplers[model] = entry
    return entry


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    model: str                                   # trained-model id OR base-model id
    messages: list[ChatMessage] = Field(default_factory=list)
    prompt: Optional[str] = None                 # convenience single-turn
    max_tokens: int = 512
    temperature: float = 0.7

    model_config = {"protected_namespaces": ()}


async def _generate(model: str, messages: list[dict], max_tokens: int, temperature: float, api_key: str) -> str:
    _, types, _ = engine.load_sdk()
    sampling_client, renderer, tokenizer = await _get_sampler(model, api_key)
    prompt = renderer.build_generation_prompt(messages)
    params = types.SamplingParams(max_tokens=max_tokens, temperature=temperature,
                                  stop=renderer.get_stop_sequences())
    resp = await sampling_client.sample_async(prompt=prompt, num_samples=1, sampling_params=params)
    seq = resp.sequences[0]
    toks = seq.tokens() if callable(getattr(seq, "tokens", None)) else list(seq.tokens)
    return tokenizer.decode(toks)


@router.post("/message")
async def chat(req: ChatRequest, x_api_key: Optional[str] = Header(None)):
    api_key = get_tinker_api_key(x_api_key)
    if not api_key:
        raise HTTPException(401, "No Tinker API key. Add it in Settings to chat with a model.")
    messages = [m.dict() for m in req.messages] or ([{"role": "user", "content": req.prompt}] if req.prompt else [])
    if not messages:
        raise HTTPException(400, "Provide a message or prompt.")
    try:
        text = await _generate(req.model, messages, req.max_tokens, req.temperature, api_key)
        return {"model": req.model, "response": text}
    except HTTPException:
        raise
    except Exception as e:
        reason = getattr(e, "message", None) or str(e)
        logger.error(f"Chat failed: {reason}")
        raise HTTPException(502, f"Generation failed: {reason}")


class CompareRequest(BaseModel):
    base_model: str
    trained_model: str
    prompt: str
    max_tokens: int = 512
    temperature: float = 0.7

    model_config = {"protected_namespaces": ()}


@router.post("/compare")
async def compare(req: CompareRequest, x_api_key: Optional[str] = Header(None)):
    """Base model vs. your fine-tuned model, side by side."""
    api_key = get_tinker_api_key(x_api_key)
    if not api_key:
        raise HTTPException(401, "No Tinker API key. Add it in Settings.")
    messages = [{"role": "user", "content": req.prompt}]
    try:
        base = await _generate(req.base_model, messages, req.max_tokens, req.temperature, api_key)
        tuned = await _generate(req.trained_model, messages, req.max_tokens, req.temperature, api_key)
        return {"prompt": req.prompt, "base": {"model": req.base_model, "response": base},
                "tuned": {"model": req.trained_model, "response": tuned}}
    except Exception as e:
        raise HTTPException(502, f"Comparison failed: {getattr(e, 'message', None) or e}")


# --- Human feedback -> preference data (RLHF loop) ---------------------------

class FeedbackRequest(BaseModel):
    prompt: str
    chosen: str
    rejected: str
    source: str = "playground"


@router.post("/feedback")
async def add_feedback(req: FeedbackRequest):
    db.add_preference({"id": f"pref_{uuid.uuid4().hex[:10]}", "prompt": req.prompt,
                       "chosen": req.chosen, "rejected": req.rejected,
                       "source": req.source, "created_at": _now()})
    return {"message": "Feedback saved", "count": db.count_preferences()}


@router.get("/feedback")
async def list_feedback():
    return {"preferences": db.list_preferences(), "count": db.count_preferences()}


class ToDatasetRequest(BaseModel):
    name: str = "playground-preferences"


@router.post("/feedback/to-dataset")
async def feedback_to_dataset(req: ToDatasetRequest):
    """Turn collected 👍/👎 feedback into a DPO-ready dataset."""
    import json
    prefs = db.list_preferences()
    if not prefs:
        raise HTTPException(400, "No feedback collected yet. Rate some responses in the Playground first.")
    dataset_id = str(uuid.uuid4())
    path = str(DATASETS_DIR / f"{dataset_id}_{req.name.strip().replace(' ', '_')[:40] or 'preferences'}.jsonl")
    with open(path, "w", encoding="utf-8") as f:
        for p in prefs:
            f.write(json.dumps({"prompt": p["prompt"], "chosen": p["chosen"], "rejected": p["rejected"]}) + "\n")
    num = len(prefs)
    rec = {"id": dataset_id, "name": req.name, "source": "feedback", "training_type": "dpo",
           "format": "jsonl", "path": path, "num_samples": num, "size_bytes": os.path.getsize(path),
           "columns": ["prompt", "chosen", "rejected"],
           "split": {"train": num, "validation": 0, "test": 0},
           "schema_ok": True, "schema_notes": [], "meta": {"from": "feedback"}, "created_at": _now()}
    return {"message": f"Created a preference dataset from {num} ratings", "dataset": db.add_dataset(rec)}
