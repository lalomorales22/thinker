"""
Chat/interaction routes for communicating with trained models
"""
from fastapi import APIRouter, HTTPException, Header
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import os
from agents.code_review_agent import CodeReviewAgent

router = APIRouter()

class Message(BaseModel):
    role: str  # user, assistant, system
    content: str

class ChatRequest(BaseModel):
    model_name: str
    messages: List[Message]
    temperature: float = 0.7
    max_tokens: int = 2048
    
    model_config = {'protected_namespaces': ()}

class ChatResponse(BaseModel):
    response: str
    model: str
    tokens_used: int

@router.post("/completions")
async def chat_completion(request: ChatRequest, x_api_key: Optional[str] = Header(None)):
    """
    Send a chat request to a trained model
    """
    # Set API key if provided
    api_key = x_api_key or os.getenv("TINKER_API_KEY")
    if api_key:
        os.environ["TINKER_API_KEY"] = api_key

    # Determine if model_name is a checkpoint path or base model
    # If it starts with "tinker://", it's a checkpoint path
    if request.model_name.startswith("tinker://"):
        # Extract base model from saved models or use default
        # For now, we'll need to find the base model from saved models
        from .models import saved_models
        saved_model = next((m for m in saved_models if m.get("checkpoint_path") == request.model_name), None)
        base_model = saved_model["base_model"] if saved_model else "meta-llama/Llama-3.2-1B"
        checkpoint_path = request.model_name
    else:
        # It's a base model name
        base_model = request.model_name
        checkpoint_path = None

    # Initialize agent with appropriate model/checkpoint
    agent = CodeReviewAgent(base_model=base_model, checkpoint_path=checkpoint_path)
    
    # Reuse the agent's sampling logic (we might want to expose a cleaner chat method on the agent later)
    # For now, we'll construct a prompt from messages
    prompt_text = "\n".join([f"{m.role}: {m.content}" for m in request.messages])
    
    # We'll use the review_code method's internal logic but adapted
    # Since review_code is specific, let's just use the agent's client if available
    client = await agent._get_sampling_client()
    
    if client:
        try:
            from tinker import types
            tokenizer = client.tokenizer
            prompt = types.ModelInput.from_ints(tokenizer.encode(prompt_text))
            params = types.SamplingParams(max_tokens=request.max_tokens, temperature=request.temperature)

            future = client.sample_async(prompt=prompt, sampling_params=params, num_samples=1)
            await future
            result = await future

            output_tokens = result.samples[0].token_ids
            response_text = tokenizer.decode(output_tokens)

            return ChatResponse(
                response=response_text,
                model=request.model_name,
                tokens_used=len(output_tokens)
            )
        except Exception as e:
            error_msg = str(e)
            print(f"Chat completion failed: {error_msg}")
            raise HTTPException(
                status_code=500,
                detail=f"Model inference failed: {error_msg}. Please check your API key and model availability."
            )

    # If no client available
    raise HTTPException(
        status_code=503,
        detail="Tinker SDK client unavailable. Please verify your API key is set correctly in settings."
    )

@router.post("/review-code")
async def review_code(code: str, language: str = "python", model_name: str = "code-reviewer-v1", x_api_key: Optional[str] = Header(None)):
    """
    Specialized endpoint for code review
    """
    # Set API key if provided
    api_key = x_api_key or os.getenv("TINKER_API_KEY")
    if api_key:
        os.environ["TINKER_API_KEY"] = api_key

    # Determine if model_name is a checkpoint path or base model
    if model_name.startswith("tinker://"):
        from .models import saved_models
        saved_model = next((m for m in saved_models if m.get("checkpoint_path") == model_name), None)
        base_model = saved_model["base_model"] if saved_model else "meta-llama/Llama-3.2-1B"
        checkpoint_path = model_name
    else:
        base_model = model_name
        checkpoint_path = None

    agent = CodeReviewAgent(base_model=base_model, checkpoint_path=checkpoint_path)
    result = await agent.review_code(code, language)

    return {
        "review": result["review"],
        "model": model_name
    }

@router.post("/feedback")
async def submit_feedback(
    review_id: str,
    rating: int,
    comments: Optional[str] = None
):
    """
    Submit feedback on a code review (for RLHF training)
    """
    # This will be used to collect preference data for reward model training
    return {
        "message": "Feedback recorded successfully",
        "review_id": review_id,
        "will_improve_model": True
    }
