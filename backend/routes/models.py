"""
Model management routes - list available models, saved checkpoints, etc.
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional

router = APIRouter()

class Model(BaseModel):
    name: str
    base_model: str
    created_at: str
    size_mb: float
    status: str  # training, ready, archived

# Mock data - will be replaced with actual Tinker model management
saved_models = [
    {
        "name": "code-reviewer-v1",
        "base_model": "meta-llama/Llama-3.2-1B",
        "created_at": "2024-10-01T12:00:00Z",
        "size_mb": 512.5,
        "status": "ready"
    }
]

@router.get("/")
async def list_models():
    """List all saved models"""
    return {"models": saved_models}

@router.get("/{model_name}")
async def get_model(model_name: str):
    """Get specific model details"""
    model = next((m for m in saved_models if m["name"] == model_name), None)
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")
    return model

@router.get("/base/available")
async def list_base_models():
    """List available base models from Tinker"""
    # This will use tinker.ServiceClient() to discover models
    return {
        "models": [
            "meta-llama/Llama-3.2-1B",
            "meta-llama/Llama-3.2-3B",
            "Qwen/Qwen2.5-7B-Instruct",
            "Qwen/Qwen3-30B-A3B-Base"
        ]
    }

@router.delete("/{model_name}")
async def delete_model(model_name: str):
    """Delete a saved model"""
    global saved_models
    model = next((m for m in saved_models if m["name"] == model_name), None)
    if not model:
        raise HTTPException(status_code=404, detail="Model not found")

    saved_models = [m for m in saved_models if m["name"] != model_name]
    return {"message": f"Model {model_name} deleted successfully"}
