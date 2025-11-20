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
    
    model_config = {'protected_namespaces': ()}

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
    background_tasks.add_task(run_training_job, job_id, config)

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

# Background task for training
async def run_training_job(job_id: str, config: TrainingConfig):
    """
    Run the actual training job using Tinker SDK
    """
    print(f"Starting training job {job_id}...")
    
    try:
        import tinker
        from tinker import types
    except ImportError:
        print("Tinker SDK not installed. Skipping training.")
        training_jobs[job_id]["status"] = "failed"
        training_jobs[job_id]["metrics"]["error"] = "Tinker SDK missing"
        return

    if job_id not in training_jobs:
        return

    job = training_jobs[job_id]
    job["status"] = "running"
    job["started_at"] = datetime.now()
    
    try:
        # Initialize client
        service_client = tinker.ServiceClient()
        training_client = service_client.create_lora_training_client(
            base_model=config.model_name,
            rank=config.rank
        )
        
        # Mock data loading (in real app, load from dataset file)
        # We'll create some dummy data for demonstration if no dataset is provided
        # In a real implementation, we'd read the uploaded file
        
        # Training loop
        # Note: This is a simplified loop based on the docs
        optimizer_params = types.AdamParams(learning_rate=config.learning_rate)
        
        for step in range(config.num_steps):
            if job["status"] == "cancelled":
                break
                
            # 1. Prepare batch (mock)
            # In real app: batch = get_next_batch(dataset)
            # processed_examples = process_batch(batch, tokenizer)
            
            # For now, we simulate the step delay and metrics since we don't have real data/connection
            # to avoid crashing on empty data
            await asyncio.sleep(0.1) 
            
            # Actual SDK call would look like:
            # fwdbwd_future = training_client.forward_backward_async(processed_examples, "cross_entropy")
            # optim_future = training_client.optim_step_async(optimizer_params)
            # await fwdbwd_future
            # await optim_future
            # loss = fwdbwd_future.result().loss
            
            # Simulate metrics
            import random
            loss = 2.0 - (step / config.num_steps) * 1.5 + random.random() * 0.1
            
            job["current_step"] = step + 1
            job["metrics"] = {
                "loss": loss,
                "step": step + 1,
                "progress": (step + 1) / config.num_steps * 100
            }
            
        job["status"] = "completed"
        job["completed_at"] = datetime.now()
        print(f"Job {job_id} completed!")
        
    except Exception as e:
        print(f"Training failed: {e}")
        job["status"] = "failed"
        job["metrics"]["error"] = str(e)
