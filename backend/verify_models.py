import requests

BASE_URL = "http://localhost:8000/api/models"

def test_list_models():
    print("Testing Model List...")
    try:
        response = requests.get(f"{BASE_URL}/base/available")
        if response.status_code == 200:
            print("✅ List Successful")
            data = response.json()
            models = data.get("models", [])
            print(f"Found {len(models)} models")
            print("First 5 models:")
            for m in models[:5]:
                print(f" - {m}")
                
            # Verify specific models exist
            required = ["Qwen/Qwen3-30B-A3B", "openai/gpt-oss-120b"]
            for r in required:
                if r in models:
                    print(f"✅ Found required model: {r}")
                else:
                    print(f"❌ Missing required model: {r}")
        else:
            print(f"❌ List Failed: {response.status_code}")
            print(response.text)
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    test_list_models()
