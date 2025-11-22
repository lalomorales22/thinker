"""
Analytics routes for aggregating training metrics and system stats
"""
from fastapi import APIRouter
from datetime import datetime
from typing import List, Dict, Any

router = APIRouter()

@router.get("/summary")
async def get_analytics_summary():
    """Get aggregate analytics across all training jobs"""
    from .training import training_jobs
    from .models import saved_models

    # Calculate aggregate metrics
    total_jobs = len(training_jobs)
    completed_jobs = sum(1 for job in training_jobs.values() if job["status"] == "completed")
    running_jobs = sum(1 for job in training_jobs.values() if job["status"] == "running")
    failed_jobs = sum(1 for job in training_jobs.values() if job["status"] == "failed")

    # Calculate total training steps
    total_steps = sum(job.get("current_step", 0) for job in training_jobs.values())

    # Calculate average loss from completed jobs
    completed_losses = [
        job.get("metrics", {}).get("loss", 0)
        for job in training_jobs.values()
        if job["status"] == "completed" and job.get("metrics", {}).get("loss") is not None
    ]
    avg_loss = sum(completed_losses) / len(completed_losses) if completed_losses else 0

    # Calculate success rate
    success_rate = (completed_jobs / total_jobs * 100) if total_jobs > 0 else 0

    # Total models saved
    total_models = len(saved_models)

    # Calculate total GPU hours (approximate based on steps)
    # Assuming each step takes ~1 second (this is a rough estimate)
    total_gpu_hours = total_steps / 3600.0

    return {
        "metrics": [
            {
                "label": "Total Models",
                "value": str(total_models),
                "change": "+100%",  # Could calculate actual change if we track history
                "trend": "up"
            },
            {
                "label": "Training Jobs",
                "value": str(total_jobs),
                "change": f"{completed_jobs} completed",
                "trend": "neutral"
            },
            {
                "label": "Success Rate",
                "value": f"{success_rate:.1f}%",
                "change": f"{failed_jobs} failed",
                "trend": "up" if success_rate > 80 else "neutral"
            },
            {
                "label": "GPU Hours",
                "value": f"{total_gpu_hours:.1f}h",
                "change": f"{running_jobs} running",
                "trend": "up"
            }
        ]
    }

@router.get("/training-runs")
async def get_training_runs():
    """Get historical training run data for charts"""
    from .training import training_jobs

    # Convert training jobs to training run format
    runs: List[Dict[str, Any]] = []

    for job_id, job in training_jobs.items():
        # Only include jobs that have started
        if job.get("started_at"):
            run = {
                "id": job_id,
                "name": f"{job['config'].get('training_type', 'training')}_{job_id.split('_')[-1]}",
                "model": job["config"].get("model_name", "unknown"),
                "dataset": "training_data",  # Could be enhanced to track actual dataset
                "status": job["status"],
                "duration": "0m",  # Will calculate below
                "loss": job.get("metrics", {}).get("loss", 0),
                "steps": job.get("current_step", 0),
                "timestamp": job.get("started_at", datetime.now()).isoformat() if isinstance(job.get("started_at"), datetime) else job.get("started_at", datetime.now().isoformat())
            }

            # Calculate duration
            if job.get("started_at") and job.get("completed_at"):
                start = job["started_at"] if isinstance(job["started_at"], datetime) else datetime.fromisoformat(job["started_at"])
                end = job["completed_at"] if isinstance(job["completed_at"], datetime) else datetime.fromisoformat(job["completed_at"])
                duration_seconds = (end - start).total_seconds()
                duration_minutes = int(duration_seconds / 60)
                run["duration"] = f"{duration_minutes}m" if duration_minutes > 0 else f"{int(duration_seconds)}s"
            elif job["status"] == "running" and job.get("started_at"):
                start = job["started_at"] if isinstance(job["started_at"], datetime) else datetime.fromisoformat(job["started_at"])
                duration_seconds = (datetime.now() - start).total_seconds()
                duration_minutes = int(duration_seconds / 60)
                run["duration"] = f"{duration_minutes}m" if duration_minutes > 0 else f"{int(duration_seconds)}s"

            runs.append(run)

    # Sort by timestamp (most recent first)
    runs.sort(key=lambda x: x["timestamp"], reverse=True)

    return {"training_runs": runs}

@router.get("/metrics-history/{job_id}")
async def get_metrics_history(job_id: str):
    """Get detailed metrics history for a specific job"""
    from .training import training_jobs

    if job_id not in training_jobs:
        return {"error": "Job not found"}

    job = training_jobs[job_id]

    # In a real implementation, we'd store metrics history
    # For now, return the current metrics
    return {
        "job_id": job_id,
        "metrics": job.get("metrics", {}),
        "history": []  # Could be enhanced to store step-by-step metrics
    }
