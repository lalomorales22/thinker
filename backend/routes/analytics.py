"""
Analytics routes — real aggregates from real data.

No more fabricated "GPU Hours" (steps/3600) or hardcoded "+100%" deltas. Every
number here is derived from the actual jobs/metrics/models in the database, and
loss curves come from the real per-step metrics time-series.
"""
from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, HTTPException

import db

router = APIRouter()


def _duration(started: str | None, completed: str | None) -> str:
    if not started:
        return "—"
    try:
        s = datetime.fromisoformat(started)
        e = datetime.fromisoformat(completed) if completed else None
        if e is None:
            return "running"
        secs = (e - s).total_seconds()
        return f"{int(secs // 60)}m {int(secs % 60)}s" if secs >= 60 else f"{int(secs)}s"
    except (ValueError, TypeError):
        return "—"


@router.get("/overview")
async def overview():
    jobs = db.list_jobs()
    models = db.list_models()
    datasets = db.list_datasets()

    by_status = {"completed": 0, "running": 0, "failed": 0, "queued": 0, "cancelled": 0}
    total_steps = 0
    for j in jobs:
        by_status[j["status"]] = by_status.get(j["status"], 0) + 1
        total_steps += j.get("current_step", 0)

    total = len(jobs)
    success_rate = (by_status["completed"] / total * 100) if total else 0.0

    return {
        "cards": [
            {"label": "Trained models", "value": len(models), "hint": "Ready to use in the Playground"},
            {"label": "Training runs", "value": total, "hint": f"{by_status['completed']} completed · {by_status['failed']} failed"},
            {"label": "Success rate", "value": f"{success_rate:.0f}%", "hint": f"{by_status['running']} running now"},
            {"label": "Datasets", "value": len(datasets), "hint": f"{sum(d['num_samples'] for d in datasets):,} total examples"},
            {"label": "Steps trained", "value": f"{total_steps:,}", "hint": "Across all runs"},
            {"label": "Feedback pairs", "value": db.count_preferences(), "hint": "From Playground ratings"},
        ],
        "by_status": by_status,
    }


@router.get("/runs")
async def runs():
    """Recent training runs with their final loss and duration (real data)."""
    out = []
    for j in db.list_jobs():
        final = db.latest_metric(j["id"])
        out.append({
            "id": j["id"],
            "name": j["name"] or j["id"],
            "kind": j["kind"],
            "base_model": j["base_model"],
            "dataset_id": j["dataset_id"],
            "status": j["status"],
            "steps": j["current_step"],
            "total_steps": j["total_steps"],
            "loss": final.get("loss"),
            "mode": final.get("mode"),
            "duration": _duration(j.get("started_at"), j.get("completed_at")),
            "created_at": j["created_at"],
        })
    return {"runs": out}


@router.get("/runs/{job_id}/metrics")
async def run_metrics(job_id: str):
    if not db.get_job(job_id):
        raise HTTPException(404, "Job not found")
    history = db.get_metrics(job_id)
    # Flatten into a chart-friendly series.
    series = [{"step": h["step"], **h["data"]} for h in history]
    return {"job_id": job_id, "series": series}
