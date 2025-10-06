"""
Training routes for starting, monitoring, and managing training jobs
"""
from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Optional, Dict, Any
import asyncio
from datetime import datetime

router = APIRouter()

# In-memory training state (will be enhanced with DB later)
training_jobs = {}

class TrainingConfig(BaseModel):
    model_name: str = "meta-llama/Llama-3.2-1B"
    rank: int = 32
    learning_rate: float = 1e-4
    num_steps: int = 100
    batch_size: int = 4
    training_type: str = "code_review"  # code_review, preference, tool_use

class TrainingJob(BaseModel):
    job_id: str
    status: str  # queued, running, completed, failed
    config: TrainingConfig
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    current_step: int = 0
    metrics: Dict[str, Any] = {}

@router.post("/start")
async def start_training(config: TrainingConfig, background_tasks: BackgroundTasks):
    """Start a new training job"""
    job_id = f"job_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

    job = TrainingJob(
        job_id=job_id,
        status="queued",
        config=config
    )

    training_jobs[job_id] = job.dict()

    # Add background task to run training
    # background_tasks.add_task(run_training_job, job_id, config)

    return {
        "job_id": job_id,
        "status": "queued",
        "message": "Training job created successfully"
    }

@router.get("/jobs")
async def list_jobs():
    """List all training jobs"""
    return {"jobs": list(training_jobs.values())}

@router.get("/jobs/{job_id}")
async def get_job(job_id: str):
    """Get training job status and metrics"""
    if job_id not in training_jobs:
        raise HTTPException(status_code=404, detail="Job not found")

    return training_jobs[job_id]

@router.delete("/jobs/{job_id}")
async def cancel_job(job_id: str):
    """Cancel a running training job"""
    if job_id not in training_jobs:
        raise HTTPException(status_code=404, detail="Job not found")

    job = training_jobs[job_id]
    if job["status"] == "running":
        job["status"] = "cancelled"
        return {"message": "Job cancelled successfully"}
    else:
        return {"message": f"Job is {job['status']}, cannot cancel"}

@router.get("/metrics/{job_id}")
async def get_metrics(job_id: str):
    """Get real-time training metrics"""
    if job_id not in training_jobs:
        raise HTTPException(status_code=404, detail="Job not found")

    job = training_jobs[job_id]
    return {
        "job_id": job_id,
        "current_step": job["current_step"],
        "metrics": job["metrics"]
    }

# Background task for training (to be implemented)
async def run_training_job(job_id: str, config: TrainingConfig):
    """
    Run the actual training job using Tinker SDK
    This will be implemented once we integrate the CodeReviewAgent
    """
    pass
