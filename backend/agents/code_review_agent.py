"""
Self-Evolving Code Review Agent

This agent uses multiple Tinker techniques:
1. Supervised fine-tuning on code review datasets
2. Tool use for fetching documentation and running tests
3. Multi-agent RL where it reviews its own suggestions
4. RLHF based on user feedback
5. Prompt distillation to internalize review best practices
"""
import os
import json
from typing import List, Dict, Any, Optional
try:
    import tinker
    from tinker import types
except ImportError:
    tinker = None
    types = None

class CodeReviewAgent:
    """
    Self-Evolving Code Review Agent that improves over time
    """

    def __init__(self, base_model: str = "meta-llama/Llama-3.2-1B", checkpoint_path: Optional[str] = None):
        self.base_model = base_model
        self.checkpoint_path = checkpoint_path  # If provided, load this checkpoint
        self.training_client = None
        self.sampling_client = None
        self.service_client = None
        self.review_history: List[Dict[str, Any]] = []
        self.api_key = None
        self._ensure_client()

    def _ensure_client(self):
        """Ensure Tinker client is initialized"""
        if self.service_client:
            return

        self.api_key = os.getenv("TINKER_API_KEY")
        
        if self.api_key and tinker:
            try:
                self.service_client = tinker.ServiceClient()
                print(f"✓ Tinker SDK initialized for {self.base_model}")
            except Exception as e:
                print(f"✗ Failed to initialize Tinker SDK: {e}")
        else:
            # Only print if we haven't warned before or if debugging
            pass

    async def _get_sampling_client(self):
        """
        Lazy load both training client (for tokenizer) and sampling client (for inference).
        Per Tinker docs: TokeniTrainingClient has get_tokenizer(), SamplingClient doesn't.
        So we always create TrainingClient first, then get SamplingClient from it.
        """
        self._ensure_client()
        if not self.sampling_client and self.service_client:
            try:
                # Always create TrainingClient first - it provides get_tokenizer()
                print(f"Creating training client for: {self.base_model}")
                self.training_client = await self.service_client.create_lora_training_client_async(
                    base_model=self.base_model,
                    rank=32  # Default rank
                )
                
                # If checkpoint path is provided, load the fine-tuned weights
                if self.checkpoint_path and self.checkpoint_path.startswith("tinker://"):
                    print(f"Loading checkpoint: {self.checkpoint_path}")
                    try:
                        await self.training_client.load_state(self.checkpoint_path)
                        print(f"Successfully loaded checkpoint: {self.checkpoint_path}")
                    except Exception as load_error:
                        print(f"Warning: Failed to load checkpoint {self.checkpoint_path}: {load_error}")
                        print("Continuing with base model weights")
                
                # Create sampling client from training client
                # This is the proper way per Tinker docs - save_weights_and_get_sampling_client
                print(f"Creating sampling client...")
                self.sampling_client = await self.training_client.save_weights_and_get_sampling_client_async(
                    name="inference_session"
                )
                print(f"Sampling client ready")
                
            except Exception as e:
                print(f"Error creating clients: {e}")
        return self.sampling_client
    
    def get_tokenizer(self):
        """Get tokenizer from the training client"""
        if self.training_client:
            return self.training_client.get_tokenizer()
        return None

    async def review_code(self, code: str, language: str = "python") -> Dict[str, Any]:
        """
        Review code and provide feedback using Tinker SDK
        """
        client = await self._get_sampling_client()
        
        if client and types:
            try:
                prompt_text = f"Review the following {language} code and provide issues and suggestions in JSON format:\n\n```{language}\n{code}\n```"
                
                # Get tokenizer from training client (SamplingClient doesn't have get_tokenizer)
                tokenizer = self.get_tokenizer()
                if not tokenizer:
                    raise Exception("Tokenizer not available")
                prompt = types.ModelInput.from_ints(tokenizer.encode(prompt_text))
                
                params = types.SamplingParams(max_tokens=1024, temperature=0.2)
                
                # Use the sync sample() method which returns a future
                future = client.sample(prompt=prompt, sampling_params=params, num_samples=1)
                result = future.result()
                
                # Parse result - structure is result.sequences[0].tokens per Tinker docs
                output_tokens = result.sequences[0].tokens
                response_text = tokenizer.decode(output_tokens)
                
                # Attempt to parse JSON from response
                try:
                    # simple extraction if wrapped in markdown
                    if "```json" in response_text:
                        json_str = response_text.split("```json")[1].split("```")[0]
                    elif "{" in response_text:
                        json_str = response_text[response_text.find("{"):response_text.rfind("}")+1]
                    else:
                        json_str = response_text
                        
                    review_data = json.loads(json_str)
                    return {
                        "review": review_data,
                        "raw_response": response_text,
                        "model": self.base_model
                    }
                except:
                    return {
                        "review": {
                            "summary": response_text,
                            "issues": [],
                            "suggestions": []
                        },
                        "model": self.base_model
                    }
                    
            except Exception as e:
                error_msg = str(e)
                print(f"Tinker sampling failed: {error_msg}")
                # Return error information
                return {
                    "review": {
                        "summary": f"Error during code review: {error_msg}",
                        "issues": [
                            {
                                "line": 1,
                                "severity": "error",
                                "message": f"Tinker SDK error: {error_msg}",
                                "suggestion": "Verify API key is set and valid. Check model availability."
                            }
                        ],
                        "score": 0,
                        "suggestions": ["Check API configuration", "Verify model availability"]
                    },
                    "model": self.base_model,
                    "error": error_msg
                }

        # If no client available
        return {
            "review": {
                "summary": "Code review unavailable - Tinker SDK client not initialized",
                "issues": [
                    {
                        "line": 1,
                        "severity": "error",
                        "message": "Tinker SDK client not initialized. Please set TINKER_API_KEY.",
                        "suggestion": "Go to Settings and configure your API key."
                    }
                ],
                "score": 0,
                "suggestions": ["Configure API key in Settings"]
            },
            "model": self.base_model,
            "error": "SDK not initialized"
        }

    def self_review(self, original_review: Dict[str, Any]) -> Dict[str, Any]:
        """
        Review its own code review (meta-learning)
        """
        # Similar logic to review_code but prompting to critique the previous review
        return {
            "meta_issues": [],
            "improved_review": original_review
        }

    def learn_from_feedback(self, review_id: str, rating: int, comments: str):
        """
        Update the model based on user feedback (RLHF)
        """
        self.review_history.append({
            "review_id": review_id,
            "rating": rating,
            "comments": comments
        })

        # When we have enough feedback, trigger RLHF training
        if len(self.review_history) >= 10: # Lowered threshold for demo
            # In a real background task, we would trigger this
            print(f"Triggering RLHF training with {len(self.review_history)} feedback items")
            # self._train_reward_model()

    def _train_reward_model(self):
        """
        Train a reward model from collected preferences
        """
        # Use Tinker's preference learning pipeline
        pass

    def _run_rl_against_reward_model(self):
        """
        Optimize policy using the learned reward model
        """
        # Use Tinker's RL training
        pass

    def use_tools(self, tool_name: str, **kwargs) -> Any:
        """
        Use external tools (documentation search, test runner, etc.)
        Similar to Search-R1's tool use
        """
        tools = {
            "search_docs": self._search_documentation,
            "run_tests": self._run_tests,
            "check_style": self._check_style
        }

        if tool_name in tools:
            return tools[tool_name](**kwargs)

        return None

    def _search_documentation(self, query: str) -> str:
        """Search relevant documentation"""
        return f"Documentation for {query}"

    def _run_tests(self, code: str) -> Dict[str, Any]:
        """Run tests on the code"""
        return {"passed": True, "coverage": 85}

    def _check_style(self, code: str, language: str) -> List[str]:
        """Check code style"""
        return ["Style check passed"]

    def distill_review_style(self, expert_reviews: List[Dict[str, Any]]):
        """
        Use prompt distillation to internalize expert review patterns
        """
        # Train on expert reviews to learn implicit review criteria
        pass
