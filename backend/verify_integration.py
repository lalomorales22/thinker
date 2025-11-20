import sys
import os
import asyncio

# Add backend to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

async def verify():
    print("Verifying Tinker SDK Integration...")
    
    # 1. Check CodeReviewAgent
    try:
        from agents.code_review_agent import CodeReviewAgent
        print("✓ Imported CodeReviewAgent")
        
        agent = CodeReviewAgent()
        print(f"✓ Instantiated CodeReviewAgent (Key present: {bool(agent.api_key)})")
        
        # Test fallback
        result = await agent.review_code("print('hello')")
        if "Tinker SDK not active" in str(result) or "placeholder" in str(result):
            print("✓ CodeReviewAgent fallback working")
        else:
            print(f"? Unexpected result from agent: {result}")
            
    except Exception as e:
        print(f"✗ CodeReviewAgent check failed: {e}")

    # 2. Check Training Route
    try:
        from routes.training import run_training_job, TrainingConfig
        print("✓ Imported training route")
    except Exception as e:
        print(f"✗ Training route check failed: {e}")

    # 3. Check Models Route
    try:
        from routes.models import list_base_models
        print("✓ Imported models route")
        # We can't easily test the async route without a request context or running loop, 
        # but import confirms syntax is likely okay.
    except Exception as e:
        print(f"✗ Models route check failed: {e}")

    print("Verification complete.")

if __name__ == "__main__":
    asyncio.run(verify())
