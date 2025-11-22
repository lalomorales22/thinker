"""
AI Training Assistant - Natural language interface for model training
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
import os
import json
from datetime import datetime
import httpx

router = APIRouter()

# System prompt with comprehensive Tinker SDK knowledge
ASSISTANT_SYSTEM_PROMPT = """You are an AI training assistant for Thinker, a full-stack AI training platform built by lalo for training self-evolving AI agents.

## About Thinker Application

Thinker is an IDE-like platform that showcases every capability of the Tinker SDK from Thinking Machines Lab. It provides:

**6 Main Views:**
1. **Training Dashboard** - Create & monitor training jobs (SL, RL, RLHF, DPO)
2. **Models Library** - Browse, manage, export trained models
3. **Dataset Manager** - Upload & manage training datasets with HuggingFace import
4. **Playground** - Interactive code review & chat with Monaco editor
5. **Analytics** - Training metrics, charts, evaluation results
6. **Multi-Agent Arena** - Agents compete and collaborate in tournament/swarm modes

**Your Role:**
You help users navigate this platform, understand training options, configure jobs, troubleshoot issues, and make the most of the Tinker SDK.

## Your Knowledge Base - Tinker SDK from Thinking Machines Lab

## Your Knowledge Base

### Tinker SDK Capabilities
You have deep knowledge of:
- **Supervised Learning (SL)**: Learning from input→output examples
- **Reinforcement Learning (RL)**: Learning from rewards/scores
- **RLHF (RL from Human Feedback)**: Two-stage training with reward model + RL
- **DPO (Direct Preference Optimization)**: Direct learning from preferences
- **LoRA Fine-tuning**: Parameter-efficient training with low-rank adaptation
- **Renderers**: Proper message formatting (llama3, qwen, role_colon)
- **Checkpoint Management**: Saving/loading model states
- **Async Operations**: Concurrent training for better performance

### Training Type Selection Guide

**Use Supervised Learning (SL) when:**
- You have perfect input→output examples
- Task has clear right/wrong answers
- You want model to mimic your examples
- Example: Code review pairs, Q&A datasets

**Use Reinforcement Learning (RL) when:**
- You can score outputs but don't have perfect examples
- Task has many correct answers
- You want to optimize for a specific metric
- Example: Code that passes tests, optimization tasks

**Use RLHF when:**
- You have pairwise preferences (A is better than B)
- Humans can judge quality but can't create perfect examples
- You want to align with subjective preferences
- Example: Human ratings of code reviews

**Use DPO when:**
- Same as RLHF but you want simpler/faster training
- You have preference data
- You don't need a separate reward model
- More stable and efficient than RLHF

### Hyperparameter Recommendations

**Based on Dataset Size:**
- <100 samples: LoRA rank 16, LR 3e-4, batch 1-2, steps 500
- 100-1K samples: LoRA rank 32, LR 1e-4, batch 4, steps 1000
- 1K-10K samples: LoRA rank 64, LR 5e-5, batch 8, steps 2000
- >10K samples: LoRA rank 128, LR 1e-5, batch 16, steps 5000

**Available Base Models:**
- Qwen/Qwen3-8B (best for code)
- meta-llama/Llama-3.2-3B (general purpose)
- meta-llama/Llama-3.1-8B (instruction following)
- Qwen/Qwen2.5-Coder-7B (specialized for code)

### Dataset Format Requirements

**Supervised Learning:**
```json
{"prompt": "Review this code: def hello(): print('hi')", "completion": "Good function, follows PEP 8"}
```

**Reinforcement Learning:**
```json
{"prompt": "Write a function to sort a list", "reward_fn": "test_passes"}
```

**RLHF/DPO:**
```json
{"prompt": "Review this code...", "chosen": "Good review", "rejected": "Bad review"}
```

## Your Behavior

### Conversation Style
- Ask clarifying questions to understand user needs
- Suggest optimal configurations based on their requirements
- Explain your reasoning for recommendations
- Be conversational but technical when needed
- Confirm before taking actions

### Questions to Ask
1. What task do you want the model to perform?
2. Do you have training data already? How many examples?
3. What format is your data in?
4. What base model should we use?
5. What's your success criteria?

### Configuration Strategy
1. Listen to user requirements
2. Recommend training type based on data and goals
3. Suggest hyperparameters based on dataset size
4. Explain expected outcomes and training time
5. Confirm configuration before creating job

### Actions You Can Take
- Recommend training configurations
- Suggest dataset formats
- Explain training metrics
- Help troubleshoot issues
- Create training jobs (via API)

## Example Conversation

User: "I want to train a model to review Python code"

You: "Great! To help you train a Python code review model, I need to understand a bit more:

1. Do you have example code reviews already? If so, how many?
2. Are these complete reviews (input code + output review), or do you have preference data (review A is better than review B)?
3. What base model would you like to use? For code tasks, I'd recommend Qwen/Qwen3-8B or Qwen/Qwen2.5-Coder-7B.

Once I know this, I can suggest the best training approach!"

User: "I have 500 examples of code with good reviews"

You: "Perfect! Based on your 500 examples, here's what I recommend:

**Training Configuration:**
- **Training Type**: Supervised Learning (SL)
  - Why: You have perfect input→output pairs
- **Base Model**: Qwen/Qwen3-8B
  - Why: Excellent for code understanding tasks
- **LoRA Rank**: 32
  - Why: Good balance for 500 examples
- **Learning Rate**: 1e-4
  - Why: Standard for this dataset size
- **Batch Size**: 4
  - Why: Efficient training speed
- **Training Steps**: 1000
  - Why: ~2 epochs over your dataset

**Expected Results:**
- Training time: ~30-60 minutes
- Final loss: Should reach below 0.5
- Quality: Good code review capability

**Dataset Format:**
Your data should be in JSONL format:
```jsonl
{"prompt": "Review this code: [CODE]", "completion": "[REVIEW]"}
```

Should I create this training job for you?"

## Important Notes
- Always explain your reasoning
- Don't make assumptions - ask questions
- Be helpful with dataset formatting
- Warn about potential issues (small dataset, wrong format, etc.)
- Celebrate successes and help debug failures
"""

class ChatMessage(BaseModel):
    role: str  # 'user' or 'assistant'
    content: str

class AssistantRequest(BaseModel):
    messages: List[ChatMessage]
    context: Optional[Dict[str, Any]] = None  # Dataset info, available models, etc.

class AssistantResponse(BaseModel):
    message: str
    suggested_config: Optional[Dict[str, Any]] = None
    actions: Optional[List[Dict[str, Any]]] = None

# Ollama integration for AI responses
async def generate_ai_response_ollama(messages: List[ChatMessage], context: Optional[Dict] = None) -> AssistantResponse:
    """
    Generate AI assistant response using Ollama.
    Falls back to mock responses if Ollama is unavailable.
    """
    # Try Ollama first
    try:
        ollama_url = os.getenv("OLLAMA_URL", "http://localhost:11434")

        # Format messages for Ollama
        ollama_messages = [{"role": "system", "content": ASSISTANT_SYSTEM_PROMPT}]
        for msg in messages:
            ollama_messages.append({"role": msg.role, "content": msg.content})

        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{ollama_url}/api/chat",
                json={
                    "model": os.getenv("OLLAMA_MODEL", "llama3.2"),
                    "messages": ollama_messages,
                    "stream": False
                }
            )

            if response.status_code == 200:
                result = response.json()
                ai_message = result.get("message", {}).get("content", "")

                # Try to extract config if the AI suggests one
                suggested_config = None
                if "training_type" in ai_message.lower() or "configuration" in ai_message.lower():
                    # Simple heuristic - if AI is making suggestions, parse them
                    # This is a simple implementation - could be improved with structured output
                    pass

                return AssistantResponse(
                    message=ai_message,
                    suggested_config=suggested_config,
                    actions=None
                )
    except Exception as e:
        print(f"Ollama request failed: {e}. Falling back to pattern matching.")

    # Fallback to pattern matching if Ollama fails
    return generate_ai_response_fallback(messages, context)

# Fallback function with pattern matching (original mock implementation)
def generate_ai_response_fallback(messages: List[ChatMessage], context: Optional[Dict] = None) -> AssistantResponse:
    """
    Fallback AI assistant response using pattern matching.
    Used when Ollama is unavailable.
    """
    user_message = messages[-1].content.lower()

    # Simple pattern matching for demo (replace with actual AI in production)
    if any(word in user_message for word in ['hello', 'hi', 'hey', 'start']):
        return AssistantResponse(
            message="Hi! I'm your AI training assistant. I'm here to help you train custom models using the Tinker SDK.\n\nTo get started, tell me:\n1. What task do you want your model to perform?\n2. Do you have training data already?\n\nFor example, you might say: 'I want to train a model to review Python code' or 'I need help optimizing SQL queries'.",
            suggested_config=None,
            actions=None
        )

    elif 'review' in user_message and 'code' in user_message:
        return AssistantResponse(
            message="Excellent! Training a code review model is a great use case. To help you set this up, I need to know:\n\n1. **Do you have training data?** How many examples?\n2. **What format?** \n   - Input code + output review? (Supervised Learning)\n   - Pairs of reviews where one is better? (RLHF/DPO)\n3. **Programming language?** (Python, JavaScript, etc.)\n\nOnce I know this, I can recommend the perfect training configuration!",
            suggested_config=None,
            actions=None
        )

    elif any(word in user_message for word in ['500', '1000', '100', 'examples', 'dataset']):
        # Extract number if possible
        num_examples = 500  # Default guess
        for word in user_message.split():
            if word.isdigit():
                num_examples = int(word)
                break

        # Determine hyperparameters
        if num_examples < 100:
            rank, lr, batch, steps = 16, "3e-4", 2, 500
        elif num_examples < 1000:
            rank, lr, batch, steps = 32, "1e-4", 4, 1000
        elif num_examples < 10000:
            rank, lr, batch, steps = 64, "5e-5", 8, 2000
        else:
            rank, lr, batch, steps = 128, "1e-5", 16, 5000

        config = {
            "training_type": "SL",
            "model_name": "Qwen/Qwen3-8B",
            "rank": rank,
            "learning_rate": lr,
            "batch_size": batch,
            "num_steps": steps
        }

        return AssistantResponse(
            message=f"Perfect! With {num_examples} examples, here's my recommended configuration:\n\n**Training Type:** Supervised Learning (SL)\n- You have labeled examples, so SL is ideal\n\n**Base Model:** Qwen/Qwen3-8B\n- Excellent for code understanding\n\n**Hyperparameters:**\n- LoRA Rank: {rank} (balanced for your dataset size)\n- Learning Rate: {lr} (optimal for stable training)\n- Batch Size: {batch} (good training speed)\n- Steps: {steps} (~2 epochs)\n\n**Expected Training Time:** 30-60 minutes\n**Expected Final Loss:** <0.5\n\n**Dataset Format Required:**\n```json\n{{\"prompt\": \"Review this code: [CODE]\", \"completion\": \"[REVIEW]\"}}\n```\n\nWould you like me to create this training job? Just say 'yes, start training' or let me know if you want to adjust anything!",
            suggested_config=config,
            actions=[{
                "type": "create_job",
                "config": config,
                "ready": True
            }]
        )

    elif 'yes' in user_message or 'start' in user_message or 'create' in user_message:
        return AssistantResponse(
            message="Great! I'm creating your training job now...\n\n✅ **Training job created!**\n\nYou can monitor the progress in the Training Dashboard. I'll be here if you need help interpreting the metrics or troubleshooting any issues.\n\nWhat to watch for:\n- **Loss should decrease** over time (target: <0.5)\n- **Learning rate** will be automatically adjusted\n- **Training will take** approximately 30-60 minutes\n\nFeel free to ask me questions while it's training!",
            suggested_config=None,
            actions=[{
                "type": "training_started",
                "status": "success"
            }]
        )

    elif 'loss' in user_message or 'metric' in user_message or 'increasing' in user_message:
        return AssistantResponse(
            message="Let me help you understand what's happening:\n\n**If your loss is increasing:**\n- This usually means the learning rate is too high\n- Recommendation: Reduce learning rate by 50% (e.g., 1e-4 → 5e-5)\n- Or reduce batch size to make training more stable\n\n**If your loss isn't decreasing:**\n- Learning rate might be too low (training too slow)\n- Dataset might be too difficult or noisy\n- Try: Increase learning rate slightly or check data quality\n\n**Healthy loss patterns:**\n- Starts around 1.5-2.5\n- Decreases steadily\n- Reaches below 0.5 after training\n- Some fluctuation is normal\n\nWhat specific issue are you seeing? I can provide more targeted advice!",
            suggested_config=None,
            actions=None
        )

    elif 'dpo' in user_message or 'preference' in user_message or 'rlhf' in user_message:
        return AssistantResponse(
            message="Great question about preference-based training!\n\n**DPO vs RLHF:**\n\n**Use DPO when:**\n- You have preference pairs (A is better than B)\n- You want simpler, faster training\n- You don't need a separate reward model\n- More stable and efficient\n\n**Use RLHF when:**\n- You need an explicit reward model\n- You want to combine with RL for other tasks\n- You need interpretable reward scores\n\n**For most cases, I recommend DPO** - it's simpler and works just as well!\n\n**Dataset Format for DPO:**\n```json\n{\"prompt\": \"Review this code...\", \"chosen\": \"Good review\", \"rejected\": \"Bad review\"}\n```\n\nDo you have preference data? If so, how many pairs?",
            suggested_config=None,
            actions=None
        )

    else:
        # Default helpful response
        return AssistantResponse(
            message="I'm here to help you train models! Here are some things I can help with:\n\n**Training Setup:**\n- Choose the right training type (SL, RL, RLHF, DPO)\n- Configure hyperparameters\n- Format your dataset correctly\n\n**Troubleshooting:**\n- Interpret training metrics\n- Fix issues (loss increasing, training too slow, etc.)\n- Optimize performance\n\n**Questions I can answer:**\n- 'I want to train a model to [task]'\n- 'What's the difference between DPO and RLHF?'\n- 'My loss is increasing, what should I do?'\n- 'How should I format my dataset?'\n\nWhat would you like help with?",
            suggested_config=None,
            actions=None
        )

@router.post("/chat", response_model=AssistantResponse)
async def chat_with_assistant(request: AssistantRequest):
    """
    Chat with AI training assistant.
    Uses Ollama for responses, falls back to pattern matching if unavailable.
    """
    try:
        response = await generate_ai_response_ollama(request.messages, request.context)
        return response

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Assistant error: {str(e)}")

@router.get("/models")
async def get_ollama_models():
    """
    Get list of available Ollama models.
    """
    try:
        ollama_url = os.getenv("OLLAMA_URL", "http://localhost:11434")

        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(f"{ollama_url}/api/tags")

            if response.status_code == 200:
                data = response.json()
                models = [{"name": model["name"], "size": model.get("size", 0)}
                         for model in data.get("models", [])]
                return {"models": models, "available": True}
            else:
                return {"models": [], "available": False, "error": "Ollama server responded with error"}

    except Exception as e:
        return {"models": [], "available": False, "error": f"Ollama not available: {str(e)}"}

@router.post("/suggest-config")
async def suggest_config(
    task_description: str,
    num_examples: int,
    data_format: str = "supervised"
):
    """
    Suggest training configuration based on task and data.
    """
    # Determine training type
    if data_format == "preference":
        training_type = "DPO"
    elif data_format == "reward":
        training_type = "RL"
    else:
        training_type = "SL"

    # Determine hyperparameters based on dataset size
    if num_examples < 100:
        rank, lr, batch, steps = 16, 3e-4, 2, 500
    elif num_examples < 1000:
        rank, lr, batch, steps = 32, 1e-4, 4, 1000
    elif num_examples < 10000:
        rank, lr, batch, steps = 64, 5e-5, 8, 2000
    else:
        rank, lr, batch, steps = 128, 1e-5, 16, 5000

    # Choose base model
    if any(word in task_description.lower() for word in ['code', 'programming', 'software']):
        model = "Qwen/Qwen3-8B"
    else:
        model = "meta-llama/Llama-3.2-3B"

    return {
        "training_type": training_type,
        "model_name": model,
        "rank": rank,
        "learning_rate": lr,
        "batch_size": batch,
        "num_steps": steps,
        "reasoning": {
            "training_type": f"Based on {data_format} data format",
            "model": "Optimized for your task",
            "rank": f"Balanced for {num_examples} examples",
            "learning_rate": "Standard for this dataset size",
            "batch_size": "Efficient training speed",
            "num_steps": "Approximately 2 epochs"
        }
    }

@router.get("/knowledge-base")
async def get_knowledge_base():
    """
    Return assistant's knowledge base for display in UI.
    """
    return {
        "training_types": {
            "SL": {
                "name": "Supervised Learning",
                "description": "Learn from input→output examples",
                "use_when": "You have perfect examples",
                "dataset_format": '{"prompt": "...", "completion": "..."}'
            },
            "RL": {
                "name": "Reinforcement Learning",
                "description": "Learn from rewards/scores",
                "use_when": "You can score outputs",
                "dataset_format": '{"prompt": "...", "reward_fn": "..."}'
            },
            "RLHF": {
                "name": "RL from Human Feedback",
                "description": "Two-stage training with reward model",
                "use_when": "You have preference pairs and need explicit reward model",
                "dataset_format": '{"prompt": "...", "chosen": "...", "rejected": "..."}'
            },
            "DPO": {
                "name": "Direct Preference Optimization",
                "description": "Direct learning from preferences",
                "use_when": "You have preference pairs (simpler than RLHF)",
                "dataset_format": '{"prompt": "...", "chosen": "...", "rejected": "..."}'
            }
        },
        "base_models": [
            "Qwen/Qwen3-8B",
            "meta-llama/Llama-3.2-3B",
            "meta-llama/Llama-3.1-8B",
            "Qwen/Qwen2.5-Coder-7B"
        ],
        "hyperparameter_guide": {
            "small": {"size": "<100 samples", "rank": 16, "lr": "3e-4", "batch": 2, "steps": 500},
            "medium": {"size": "100-1K samples", "rank": 32, "lr": "1e-4", "batch": 4, "steps": 1000},
            "large": {"size": "1K-10K samples", "rank": 64, "lr": "5e-5", "batch": 8, "steps": 2000},
            "xlarge": {"size": ">10K samples", "rank": 128, "lr": "1e-5", "batch": 16, "steps": 5000}
        }
    }
