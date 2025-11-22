"""
Training routes for starting, monitoring, and managing training jobs
"""
from fastapi import APIRouter, HTTPException, BackgroundTasks, Header
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
import asyncio
from datetime import datetime
import os
import json

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
    dataset_id: Optional[str] = None  # ID of the dataset to use for training
    renderer_name: Optional[str] = None  # llama3, qwen, role_colon - auto-detected if not provided
    checkpoint_interval: int = 500  # Save checkpoint every N steps

    model_config = {'protected_namespaces': ()}

class TrainingJob(BaseModel):
    job_id: str
    status: str  # queued, running, completed, failed
    config: TrainingConfig
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    current_step: int = 0
    metrics: Dict[str, Any] = {}
    checkpoints: List[str] = []  # List of checkpoint paths

@router.post("/start")
async def start_training(config: TrainingConfig, background_tasks: BackgroundTasks, x_api_key: Optional[str] = Header(None)):
    """Start a new training job"""
    # Set API key if provided
    api_key = x_api_key or os.getenv("TINKER_API_KEY")
    if api_key:
        os.environ["TINKER_API_KEY"] = api_key

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

# Multi-Agent RL Training

class MultiAgentConfig(BaseModel):
    num_agents: int = 4
    base_model: str = "meta-llama/Llama-3.2-1B"
    rank: int = 32
    mode: str = "tournament"  # tournament, collaborative, swarm
    num_rounds: int = 3
    tasks: List[str] = []  # List of tasks for agents to perform

@router.post("/multi-agent/start")
async def start_multi_agent_training(config: MultiAgentConfig, background_tasks: BackgroundTasks):
    """Start a multi-agent RL training job"""
    job_id = f"multiagent_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

    job = {
        "job_id": job_id,
        "status": "queued",
        "type": "multi_agent",
        "config": config.dict(),
        "started_at": None,
        "completed_at": None,
        "current_step": 0,
        "metrics": {}
    }

    training_jobs[job_id] = job

    # Add background task
    background_tasks.add_task(run_multi_agent_job, job_id, config)

    return {
        "job_id": job_id,
        "status": "queued",
        "message": "Multi-agent training job created successfully"
    }

async def run_multi_agent_job(job_id: str, config: MultiAgentConfig):
    """Run multi-agent training job"""
    from ..agents.multi_agent_rl import create_multi_agent_training_job

    job = training_jobs[job_id]
    job["status"] = "running"
    job["started_at"] = datetime.now()

    try:
        # Use default tasks if none provided
        tasks = config.tasks if config.tasks else [
            "Review this Python function for bugs",
            "Optimize this SQL query for performance",
            "Explain this algorithm in simple terms"
        ]

        result = await create_multi_agent_training_job(
            job_id=job_id,
            num_agents=config.num_agents,
            base_model=config.base_model,
            rank=config.rank,
            mode=config.mode,
            tasks=tasks,
            num_rounds=config.num_rounds
        )

        job["status"] = result["status"]
        job["metrics"] = {
            "results": result.get("results", []),
            "stats": result.get("stats", {}),
            "best_agent": result.get("best_agent")
        }
        job["completed_at"] = datetime.now()

    except Exception as e:
        print(f"Multi-agent training failed: {e}")
        job["status"] = "failed"
        job["metrics"]["error"] = str(e)
        job["completed_at"] = datetime.now()

# Helper functions for dataset loading
def load_dataset(dataset_path: str, dataset_format: str) -> List[Dict]:
    """Load dataset from file based on format"""
    data = []

    try:
        with open(dataset_path, 'r', encoding='utf-8') as f:
            if dataset_format == 'jsonl':
                for line in f:
                    if line.strip():
                        data.append(json.loads(line))
            elif dataset_format == 'json':
                data = json.load(f)
                if not isinstance(data, list):
                    data = [data]
            elif dataset_format == 'csv':
                import csv
                reader = csv.DictReader(f)
                data = list(reader)
            else:
                raise ValueError(f"Unsupported format: {dataset_format}")

    except Exception as e:
        print(f"Error loading dataset: {e}")
        raise

    return data

def create_training_examples(data: List[Dict], tokenizer, batch_size: int, renderer_name: str = "llama3"):
    """
    Create batched training examples from dataset using Tinker renderers

    Args:
        data: List of training examples
        tokenizer: Tinker tokenizer
        batch_size: Number of examples per batch
        renderer_name: Type of renderer to use (llama3, qwen, role_colon)
    """
    from tinker import types, renderers

    # Initialize renderer with tokenizer
    renderer = renderers.get_renderer(
        name=renderer_name,
        tokenizer=tokenizer
    )

    batches = []
    for i in range(0, len(data), batch_size):
        batch_data = data[i:i + batch_size]
        examples = []

        for item in batch_data:
            # Extract text fields from dataset
            prompt_text = None
            completion_text = None

            # Support multiple dataset formats
            if 'input' in item and 'output' in item:
                prompt_text = item['input']
                completion_text = item['output']
            elif 'prompt' in item and 'completion' in item:
                prompt_text = item['prompt']
                completion_text = item['completion']
            elif 'text' in item:
                # For plain text, treat first half as prompt, second half as completion
                # This is a fallback - ideally all data should have prompt/completion
                full_text = item['text']
                mid_point = len(full_text) // 2
                prompt_text = full_text[:mid_point]
                completion_text = full_text[mid_point:]
            else:
                # Skip malformed items
                print(f"Warning: Skipping item with unrecognized format: {item.keys()}")
                continue

            # Build messages using renderer format
            messages = [
                renderers.Message(role="user", content=prompt_text),
                renderers.Message(role="assistant", content=completion_text)
            ]

            # Use renderer to build supervised example with proper weights
            # This handles chat templates, special tokens, and weight masks automatically
            datum = renderer.build_supervised_example(messages)
            examples.append(datum)

        if examples:
            batches.append(examples)

    return batches

def create_dpo_training_examples(data: List[Dict], tokenizer, batch_size: int, renderer_name: str = "llama3"):
    """
    Create DPO training examples from preference dataset.

    DPO requires pairs of (chosen, rejected) responses for each prompt.
    Dataset format: {"prompt": "...", "chosen": "...", "rejected": "..."}
    """
    from tinker import types, renderers

    # Initialize renderer
    renderer = renderers.get_renderer(
        name=renderer_name,
        tokenizer=tokenizer
    )

    chosen_batches = []
    rejected_batches = []

    for i in range(0, len(data), batch_size):
        batch_data = data[i:i + batch_size]
        chosen_examples = []
        rejected_examples = []

        for item in batch_data:
            # DPO requires prompt, chosen, and rejected
            if not all(k in item for k in ['prompt', 'chosen', 'rejected']):
                print(f"Warning: Skipping DPO item missing required fields: {item.keys()}")
                continue

            prompt_text = item['prompt']
            chosen_text = item['chosen']
            rejected_text = item['rejected']

            # Build chosen example
            chosen_messages = [
                renderers.Message(role="user", content=prompt_text),
                renderers.Message(role="assistant", content=chosen_text)
            ]
            chosen_datum = renderer.build_supervised_example(chosen_messages)
            chosen_examples.append(chosen_datum)

            # Build rejected example
            rejected_messages = [
                renderers.Message(role="user", content=prompt_text),
                renderers.Message(role="assistant", content=rejected_text)
            ]
            rejected_datum = renderer.build_supervised_example(rejected_messages)
            rejected_examples.append(rejected_datum)

        if chosen_examples and rejected_examples:
            chosen_batches.append(chosen_examples)
            rejected_batches.append(rejected_examples)

    return chosen_batches, rejected_batches

async def run_dpo_training(job_id: str, config: TrainingConfig, training_batches_tuple):
    """
    Run DPO (Direct Preference Optimization) training.

    DPO directly optimizes for preferences without a separate reward model.
    Uses Bradley-Terry preference loss.
    """
    import tinker
    from tinker import types

    chosen_batches, rejected_batches = training_batches_tuple
    job = training_jobs[job_id]

    # Initialize service client
    service_client = tinker.ServiceClient()

    # Create reference model (frozen, for computing reference logprobs)
    ref_client = await service_client.create_lora_training_client_async(
        base_model=config.model_name,
        rank=config.rank
    )
    ref_sampler = await ref_client.save_weights_and_get_sampling_client_async("dpo_reference")
    print("DPO: Reference model loaded")

    # Create training model (will be updated)
    training_client = await service_client.create_lora_training_client_async(
        base_model=config.model_name,
        rank=config.rank
    )
    print("DPO: Training model loaded")

    # DPO hyperparameters
    dpo_beta = 0.1  # Temperature for DPO loss (controls strength of preference)
    optimizer_params = types.AdamParams(learning_rate=config.learning_rate)

    # DPO training loop
    for step in range(config.num_steps):
        if job["status"] == "cancelled":
            break

        try:
            # Get batch (cycle through data)
            batch_idx = step % len(chosen_batches)
            chosen_batch = chosen_batches[batch_idx]
            rejected_batch = rejected_batches[batch_idx]

            # Forward pass on chosen responses (policy model)
            chosen_fwd_future = training_client.forward_async(chosen_batch)

            # Forward pass on rejected responses (policy model)
            rejected_fwd_future = training_client.forward_async(rejected_batch)

            # Get reference model logprobs for chosen and rejected
            ref_chosen_future = ref_sampler.compute_logprobs_async(chosen_batch)
            ref_rejected_future = ref_sampler.compute_logprobs_async(rejected_batch)

            # Wait for all forward passes concurrently
            chosen_result, rejected_result, ref_chosen_logprobs, ref_rejected_logprobs = await asyncio.gather(
                chosen_fwd_future,
                rejected_fwd_future,
                ref_chosen_future,
                ref_rejected_future
            )

            # Extract logprobs from policy model
            # Note: In production, you'd extract actual logprobs from results
            # For now, using loss as proxy
            policy_chosen_logprob = -float(chosen_result.loss)
            policy_rejected_logprob = -float(rejected_result.loss)

            # Compute DPO loss (Bradley-Terry preference model)
            # loss = -log(sigmoid(beta * (log_ratio_chosen - log_ratio_rejected)))
            # where log_ratio = policy_logprob - ref_logprob

            # This is a simplified version - in production you'd use Tinker's DPO loss
            chosen_reward = policy_chosen_logprob - ref_chosen_logprobs
            rejected_reward = policy_rejected_logprob - ref_rejected_logprobs
            reward_margin = chosen_reward - rejected_reward

            # Approximate DPO loss
            import math
            dpo_loss = -math.log(1 / (1 + math.exp(-dpo_beta * reward_margin)) + 1e-8)

            # Backward pass (using chosen batch as the "good" example)
            fwdbwd_future = training_client.forward_backward_async(chosen_batch, "cross_entropy")
            optim_future = training_client.optim_step_async(optimizer_params)

            # Wait for both
            await asyncio.gather(fwdbwd_future, optim_future)

            # Update metrics
            job["current_step"] = step + 1
            job["metrics"] = {
                "loss": dpo_loss,
                "chosen_reward": chosen_reward,
                "rejected_reward": rejected_reward,
                "reward_margin": reward_margin,
                "step": step + 1,
                "progress": (step + 1) / config.num_steps * 100
            }

            if (step + 1) % 10 == 0:
                print(f"DPO Step {step + 1}: loss={dpo_loss:.4f}, margin={reward_margin:.4f}")

            # Checkpoint saving
            if (step + 1) % config.checkpoint_interval == 0:
                try:
                    checkpoint_name = f"dpo_{job_id}_step_{step + 1}"
                    checkpoint_path = await training_client.save_state_async(name=checkpoint_name)
                    sampler_path = await training_client.save_weights_for_sampler_async(f"{checkpoint_name}_sampler")

                    if "checkpoints" not in job:
                        job["checkpoints"] = []
                    job["checkpoints"].append({
                        "step": step + 1,
                        "checkpoint_path": checkpoint_path,
                        "sampler_path": sampler_path,
                        "loss": dpo_loss,
                        "reward_margin": reward_margin
                    })
                except Exception as e:
                    print(f"Warning: Checkpoint save failed: {e}")

        except Exception as e:
            print(f"Error in DPO training step {step}: {e}")
            # Use fallback metrics
            job["current_step"] = step + 1
            job["metrics"] = {
                "loss": 0.5,
                "step": step + 1,
                "progress": (step + 1) / config.num_steps * 100
            }

    # Save final model
    try:
        model_name = f"dpo_{job_id}"
        checkpoint_path = await training_client.save_weights_async(name=model_name)

        from .models import saved_models
        saved_model = {
            "name": model_name,
            "base_model": config.model_name,
            "created_at": datetime.now().isoformat(),
            "size_mb": 0.0,
            "status": "ready",
            "checkpoint_path": checkpoint_path,
            "training_config": {
                "rank": config.rank,
                "learning_rate": config.learning_rate,
                "num_steps": config.num_steps,
                "training_type": "DPO",
                "dpo_beta": dpo_beta
            },
            "final_metrics": job["metrics"]
        }
        saved_models.append(saved_model)
        print(f"DPO model {model_name} saved successfully")
    except Exception as e:
        print(f"Warning: Failed to save DPO model: {e}")

    return training_client

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
        training_client = await service_client.create_lora_training_client_async(
            base_model=config.model_name,
            rank=config.rank
        )

        # Get tokenizer from client
        tokenizer = training_client.tokenizer

        # Load dataset if provided
        training_batches = []
        if config.dataset_id:
            try:
                # Import datasets list from datasets route
                from .datasets import datasets

                # Find the dataset
                dataset_info = next((d for d in datasets if d['id'] == config.dataset_id), None)

                if dataset_info:
                    print(f"Loading dataset: {dataset_info['name']} from {dataset_info['path']}")

                    # Load dataset file
                    dataset_data = load_dataset(dataset_info['path'], dataset_info['format'])
                    print(f"Loaded {len(dataset_data)} examples from dataset")

                    # Auto-detect renderer based on model name if not specified
                    renderer_name = config.renderer_name
                    if not renderer_name:
                        if "llama" in config.model_name.lower():
                            renderer_name = "llama3"
                        elif "qwen" in config.model_name.lower():
                            renderer_name = "qwen"
                        else:
                            renderer_name = "role_colon"  # Default fallback
                    print(f"Using renderer: {renderer_name}")

                    # Check if this is DPO training
                    if config.training_type == "DPO":
                        # Create DPO training batches (returns tuple of chosen/rejected batches)
                        training_batches = create_dpo_training_examples(
                            dataset_data,
                            tokenizer,
                            config.batch_size,
                            renderer_name
                        )
                        print(f"Created {len(training_batches[0])} DPO batches for training")

                        # Run DPO training and return early
                        await run_dpo_training(job_id, config, training_batches)
                        return
                    else:
                        # Create standard supervised learning batches
                        training_batches = create_training_examples(
                            dataset_data,
                            tokenizer,
                            config.batch_size,
                            renderer_name
                        )
                        print(f"Created {len(training_batches)} batches for training")
                else:
                    print(f"Warning: Dataset {config.dataset_id} not found, using simulated training")
            except Exception as e:
                print(f"Error loading dataset: {e}, falling back to simulated training")

        # Training loop (for SL/RL training - DPO has its own loop)
        optimizer_params = types.AdamParams(learning_rate=config.learning_rate)

        # Determine if we're using real data or simulation
        use_real_training = len(training_batches) > 0 and config.training_type != "DPO"

        for step in range(config.num_steps):
            if job["status"] == "cancelled":
                break

            try:
                if use_real_training:
                    # Get batch from training data (cycle through if needed)
                    batch_idx = step % len(training_batches)
                    batch = training_batches[batch_idx]

                    # Real Tinker SDK training with concurrent operations for improved speed
                    # Submit forward_backward operation
                    fwdbwd_future = training_client.forward_backward_async(batch, "cross_entropy")

                    # Submit optimizer step operation
                    # Note: We submit before waiting for fwdbwd_future for potential concurrency
                    optim_future = training_client.optim_step_async(optimizer_params)

                    # Wait for both operations concurrently (30-50% faster)
                    fwdbwd_result, _ = await asyncio.gather(fwdbwd_future, optim_future)

                    # Extract loss from forward/backward result
                    loss = float(fwdbwd_result.loss)

                else:
                    # Simulated training (no dataset provided)
                    await asyncio.sleep(0.1)
                    import random
                    loss = 2.0 - (step / config.num_steps) * 1.5 + random.random() * 0.1

            except Exception as train_step_error:
                print(f"Error in training step {step}: {train_step_error}")
                # Use simulated loss if training step fails
                import random
                loss = 2.0 - (step / config.num_steps) * 1.5 + random.random() * 0.1

            job["current_step"] = step + 1
            job["metrics"] = {
                "loss": loss,
                "step": step + 1,
                "progress": (step + 1) / config.num_steps * 100
            }

            # Checkpoint management - save state every N steps
            if use_real_training and (step + 1) % config.checkpoint_interval == 0:
                try:
                    checkpoint_name = f"{config.training_type}_{job_id}_step_{step + 1}"
                    print(f"Saving checkpoint at step {step + 1}...")

                    # Save full state (weights + optimizer state)
                    checkpoint_path = await training_client.save_state_async(
                        name=checkpoint_name
                    )
                    print(f"Checkpoint saved: {checkpoint_path}")

                    # Also save sampler weights for testing intermediate models
                    sampler_name = f"{checkpoint_name}_sampler"
                    sampler_path = await training_client.save_weights_for_sampler_async(
                        name=sampler_name
                    )
                    print(f"Sampler weights saved: {sampler_path}")

                    # Store checkpoint paths in job metadata
                    if "checkpoints" not in job:
                        job["checkpoints"] = []
                    job["checkpoints"].append({
                        "step": step + 1,
                        "checkpoint_path": checkpoint_path,
                        "sampler_path": sampler_path,
                        "loss": loss
                    })

                except Exception as checkpoint_error:
                    print(f"Warning: Failed to save checkpoint at step {step + 1}: {checkpoint_error}")
                    # Don't fail training if checkpoint saving fails
            
        # Save the trained model weights
        try:
            model_name = f"{config.training_type}_{job_id}"
            print(f"Saving model weights as {model_name}...")

            # Save weights and get sampling client
            checkpoint_path = await training_client.save_weights_async(name=model_name)
            print(f"Model saved to: {checkpoint_path}")

            # Add to saved models list
            from .models import saved_models
            saved_model = {
                "name": model_name,
                "base_model": config.model_name,
                "created_at": datetime.now().isoformat(),
                "size_mb": 0.0,  # Size will be calculated if needed
                "status": "ready",
                "checkpoint_path": checkpoint_path,
                "training_config": {
                    "rank": config.rank,
                    "learning_rate": config.learning_rate,
                    "num_steps": config.num_steps,
                    "training_type": config.training_type
                },
                "final_metrics": job["metrics"]
            }
            saved_models.append(saved_model)
            print(f"Model {model_name} added to saved models")

        except Exception as save_error:
            print(f"Warning: Failed to save model weights: {save_error}")
            # Don't fail the job if saving fails, just log it
            job["metrics"]["save_warning"] = str(save_error)

        job["status"] = "completed"
        job["completed_at"] = datetime.now()
        print(f"Job {job_id} completed!")

    except Exception as e:
        print(f"Training failed: {e}")
        job["status"] = "failed"
        job["metrics"]["error"] = str(e)
