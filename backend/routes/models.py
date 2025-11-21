"""
Model management routes - list available models, saved checkpoints, etc.
"""
from fastapi import APIRouter, HTTPException, Header
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
async def list_base_models(x_api_key: Optional[str] = Header(None)):
    """List available base models from Tinker"""
    try:
        import tinker
        # Check for API key from header or environment
        import os
        api_key = x_api_key or os.getenv("TINKER_API_KEY")
        if not api_key:
            raise ValueError("TINKER_API_KEY not set")

        # Set API key for this request
        os.environ["TINKER_API_KEY"] = api_key
            
        service_client = tinker.ServiceClient()
        # Use async version to avoid sync-from-async warnings
        capabilities = await service_client.get_server_capabilities_async()
        models = capabilities.supported_models
        return {"models": models}
    except Exception as e:
        print(f"Failed to fetch Tinker models: {e}")
        # Fallback to hardcoded list
        return {
            "models": [
                "Qwen/Qwen3-235B-A22B-Instruct-2507",
                "Qwen/Qwen3-30B-A3B-Instruct-2507",
                "Qwen/Qwen3-30B-A3B",
                "Qwen/Qwen3-30B-A3B-Base",
                "Qwen/Qwen3-32B",
                "Qwen/Qwen3-8B",
                "Qwen/Qwen3-8B-Base",
                "Qwen/Qwen3-4B-Instruct-2507",
                "openai/gpt-oss-120b",
                "openai/gpt-oss-20b",
                "deepseek-ai/DeepSeek-V3.1",
                "deepseek-ai/DeepSeek-V3.1-Base",
                "meta-llama/Llama-3.1-70B",
                "meta-llama/Llama-3.3-70B-Instruct",
                "meta-llama/Llama-3.1-8B",
                "meta-llama/Llama-3.1-8B-Instruct",
                "meta-llama/Llama-3.2-3B",
                "meta-llama/Llama-3.2-1B"
            ],
            "source": "fallback (Tinker API unavailable)"
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
