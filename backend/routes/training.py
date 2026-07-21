"""
Training routes — supervised, preference (DPO), and reinforcement learning.

Thin controllers over the real engine (training/engine.py) and SQLite (db.py):
- Jobs, metrics, and produced models are persisted (survive restart).
- Failures are honest: a job goes `failed` with the real reason. There is NO
  silent fall-back to a fabricated loss curve.
- Progress streams to the UI over WebSocket via the event hub.
"""
from __future__ import annotations

import asyncio
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field

import db
from config import get_tinker_api_key
from events import hub
from training import datautil, engine
from utils import logger

router = APIRouter()

# Track running asyncio tasks so we can observe/cancel them.
_running: dict[str, asyncio.Task] = {}

VALID_KINDS = {"sl", "dpo", "rl"}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class TrainingConfig(BaseModel):
    name: str = ""
    base_model: str = "Qwen/Qwen3.5-4B"
    training_type: str = "sl"                 # sl | dpo | rl
    dataset_id: Optional[str] = None
    rank: int = 32
    learning_rate: float = 1e-4
    num_steps: int = 100
    batch_size: int = 4
    max_length: int = 1024
    renderer_name: Optional[str] = None
    checkpoint_interval: int = 0              # 0 = auto (num_steps // 4)
    # DPO
    dpo_beta: float = 0.1
    # RL
    rl_group_size: int = 4
    rl_max_tokens: int = 256
    rl_temperature: float = 1.0
    # Explicit demo mode (no Tinker key needed; clearly labeled as NOT real).
    dry_run: bool = False

    model_config = {"protected_namespaces": ()}


@router.post("/start")
async def start_training(config: TrainingConfig, x_api_key: Optional[str] = Header(None)):
    kind = (config.training_type or "sl").lower()
    if kind not in VALID_KINDS:
        raise HTTPException(400, f"Unknown training_type '{config.training_type}'. Use one of: {', '.join(sorted(VALID_KINDS))}.")

    api_key = get_tinker_api_key(x_api_key)
    if not config.dry_run and not api_key:
        raise HTTPException(401, "No Tinker API key. Add it in Settings, or enable Demo mode to preview without training.")

    job_id = f"job_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}"
    model_name = (config.name or f"{kind}-model").strip().replace(" ", "-").lower()
    model_name = f"{model_name}-{uuid.uuid4().hex[:4]}"

    job = db.create_job({
        "id": job_id,
        "name": config.name or model_name,
        "kind": kind,
        "status": "queued",
        "base_model": config.base_model,
        "dataset_id": config.dataset_id,
        "total_steps": config.num_steps,
        "config": {**config.dict(), "model_name": model_name},
        "created_at": _now(),
    })

    _running[job_id] = asyncio.create_task(_run_job(job_id, config, model_name, api_key))
    hub.publish({"type": "job_created", "data": job})
    return {"job_id": job_id, "status": "queued", "job": job}


def _friendly_training_error(e: Exception) -> str:
    """Turn an SDK exception into something a person can act on.

    The raw messages are opaque — a failed run reported only "Connection error.",
    which is indistinguishable from a bad key unless you already know the SDK
    raises a different type for auth. Each of these means a different fix.
    """
    name = type(e).__name__
    raw = getattr(e, "message", None) or str(e)

    if "must start with" in raw and "tml-" in raw:
        return ("That Tinker API key looks malformed — real keys start with 'tml-'. "
                "Check the key in Settings.")
    if name == "AuthenticationError" or "Unable to validate credential" in raw:
        return ("Tinker rejected that API key (401). It may be inactive, revoked, or from a "
                "different account — check it in Settings and confirm it's active.")
    if name == "APIConnectionError" or raw.strip() == "Connection error.":
        return ("Couldn't reach the Tinker API (tinker.thinkingmachines.dev). This is a network "
                "problem, not your key — check your connection and try again.")
    if name == "RateLimitError":
        return "Tinker rate limit reached. Wait a moment and start the run again."
    return raw


async def _run_job(job_id: str, config: TrainingConfig, model_name: str, api_key: Optional[str]):
    kind = config.training_type.lower()

    def report(step: int, metrics: dict[str, Any], status_message: str = "") -> None:
        db.update_job(job_id, current_step=step, status_message=status_message)
        if step > 0:
            db.add_metric(job_id, step, metrics)
        hub.publish({"type": "job_progress", "data": {
            "job_id": job_id, "step": step, "metrics": metrics, "status_message": status_message}})

    def should_cancel() -> bool:
        j = db.get_job(job_id)
        return bool(j and j["status"] == "cancelled")

    try:
        if api_key:
            os.environ["TINKER_API_KEY"] = api_key

        db.update_job(job_id, status="running", started_at=_now(), status_message="Preparing…")
        hub.publish({"type": "job_status", "data": {"job_id": job_id, "status": "running"}})

        examples: list[Any] = []
        if config.dataset_id:
            ds = db.get_dataset(config.dataset_id)
            if not ds:
                raise ValueError(f"Dataset '{config.dataset_id}' not found.")
            rows = datautil.load_rows(ds["path"], ds["format"])
            report(0, {}, f"Loaded {len(rows)} rows from '{ds['name']}'")
            check = datautil.validate(rows, kind)
            if not check["ok"]:
                raise ValueError("Dataset is not compatible with this training type. " + " ".join(check["notes"]))
            examples = list(datautil.iter_examples(rows, kind))
        elif not config.dry_run:
            raise ValueError("Select a dataset to train on (or enable Demo mode to preview without data).")

        cfg = {**config.dict(), "model_name": model_name}
        summary = await engine.run_training(kind, cfg, examples, report, should_cancel)

        if summary.get("status") == "cancelled":
            db.update_job(job_id, status="cancelled", completed_at=_now(), status_message="Cancelled by user")
            hub.publish({"type": "job_status", "data": {"job_id": job_id, "status": "cancelled"}})
            return

        # Persist the produced model (unless this was a labeled demo run).
        if not summary.get("demo"):
            db.add_model({
                "id": model_name,
                "base_model": config.base_model,
                "training_type": kind,
                "status": "ready",
                "tinker_path": summary.get("tinker_path"),
                "sampler_path": summary.get("sampler_path"),
                "job_id": job_id,
                "config": cfg,
                "final_metrics": db.latest_metric(job_id),
                "created_at": _now(),
            })

        db.update_job(job_id, status="completed", completed_at=_now(),
                      status_message="Done", result=summary)
        hub.publish({"type": "job_status", "data": {"job_id": job_id, "status": "completed", "summary": summary}})
        logger.info(f"Job {job_id} completed ({kind})")

    except asyncio.CancelledError:
        db.update_job(job_id, status="cancelled", completed_at=_now(), status_message="Cancelled")
        raise
    except Exception as e:
        reason = _friendly_training_error(e)
        logger.error(f"Job {job_id} failed: {reason}")
        db.update_job(job_id, status="failed", completed_at=_now(), error=reason, status_message="Failed")
        hub.publish({"type": "job_status", "data": {"job_id": job_id, "status": "failed", "error": reason}})
    finally:
        _running.pop(job_id, None)


@router.get("/jobs")
async def list_jobs():
    return {"jobs": db.list_jobs()}


@router.get("/jobs/{job_id}")
async def get_job(job_id: str):
    job = db.get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    job["metrics"] = db.latest_metric(job_id)
    return job


@router.get("/jobs/{job_id}/metrics")
async def get_job_metrics(job_id: str):
    if not db.get_job(job_id):
        raise HTTPException(404, "Job not found")
    return {"job_id": job_id, "history": db.get_metrics(job_id)}


@router.post("/jobs/{job_id}/cancel")
async def cancel_job(job_id: str):
    job = db.get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    if job["status"] in ("running", "queued"):
        db.update_job(job_id, status="cancelled", status_message="Cancelling…")
        hub.publish({"type": "job_status", "data": {"job_id": job_id, "status": "cancelled"}})
    return {"job_id": job_id, "status": "cancelled"}


@router.delete("/jobs/{job_id}")
async def delete_job(job_id: str):
    job = db.get_job(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    if job["status"] in ("running", "queued"):
        db.update_job(job_id, status="cancelled")
        task = _running.get(job_id)
        if task:
            task.cancel()
    db.delete_job(job_id)
    return {"message": f"Job {job_id} deleted"}


# --- Multi-Agent RL ----------------------------------------------------------

class MultiAgentConfig(BaseModel):
    name: str = "arena"
    num_agents: int = 3
    base_model: str = "Qwen/Qwen3.5-4B"
    rank: int = 32
    mode: str = "tournament"                 # tournament | swarm
    num_rounds: int = 3
    dataset_id: Optional[str] = None
    tasks: list[str] = Field(default_factory=list)
    rl_group_size: int = 4
    rl_max_tokens: int = 256
    learning_rate: float = 1e-5
    dry_run: bool = False

    model_config = {"protected_namespaces": ()}


@router.post("/multi-agent/start")
async def start_multi_agent(config: MultiAgentConfig, x_api_key: Optional[str] = Header(None)):
    api_key = get_tinker_api_key(x_api_key)
    if not config.dry_run and not api_key:
        raise HTTPException(401, "No Tinker API key. Add it in Settings, or enable Demo mode to preview.")

    job_id = f"arena_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:6]}"
    job = db.create_job({
        "id": job_id, "name": config.name, "kind": "multi_agent", "status": "queued",
        "base_model": config.base_model, "dataset_id": config.dataset_id,
        "total_steps": config.num_rounds, "config": config.dict(), "created_at": _now(),
    })
    _running[job_id] = asyncio.create_task(_run_multi_agent(job_id, config, api_key))
    hub.publish({"type": "job_created", "data": job})
    return {"job_id": job_id, "status": "queued", "job": job}


async def _run_multi_agent(job_id: str, config: MultiAgentConfig, api_key: Optional[str]):
    from agents.multi_agent_rl import run_arena

    def report(step: int, metrics: dict[str, Any], status_message: str = "") -> None:
        db.update_job(job_id, current_step=step, status_message=status_message)
        if step > 0:
            db.add_metric(job_id, step, metrics)
        hub.publish({"type": "job_progress", "data": {
            "job_id": job_id, "step": step, "metrics": metrics, "status_message": status_message}})

    def should_cancel() -> bool:
        j = db.get_job(job_id)
        return bool(j and j["status"] == "cancelled")

    try:
        if api_key:
            os.environ["TINKER_API_KEY"] = api_key
        db.update_job(job_id, status="running", started_at=_now())

        tasks = list(config.tasks)
        if config.dataset_id:
            ds = db.get_dataset(config.dataset_id)
            if ds:
                rows = datautil.load_rows(ds["path"], ds["format"], limit=64)
                tasks += [ex["prompt"] for ex in datautil.iter_examples(rows, "rl")]
        if not tasks:
            tasks = [
                "Review this Python function for bugs and suggest a fix.",
                "Explain what this code does in plain language.",
                "Refactor this snippet to be more readable.",
            ]

        summary = await run_arena(config.dict(), tasks, report, should_cancel)
        db.update_job(job_id, status="completed", completed_at=_now(), result=summary, status_message="Done")
        hub.publish({"type": "job_status", "data": {"job_id": job_id, "status": "completed", "summary": summary}})
    except Exception as e:
        reason = getattr(e, "message", None) or str(e)
        logger.error(f"Arena {job_id} failed: {reason}")
        db.update_job(job_id, status="failed", completed_at=_now(), error=reason)
        hub.publish({"type": "job_status", "data": {"job_id": job_id, "status": "failed", "error": reason}})
    finally:
        _running.pop(job_id, None)
