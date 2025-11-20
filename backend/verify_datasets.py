import requests
import os

BASE_URL = "http://localhost:8000/api/datasets"

def test_dataset_upload():
    print("Testing Dataset Upload...")
    
    # Create a dummy file
    with open("test_dataset.jsonl", "w") as f:
        f.write('{"text": "sample 1"}\n{"text": "sample 2"}')
        
    try:
        files = {'file': open('test_dataset.jsonl', 'rb')}
        data = {
            'name': 'Test Dataset',
            'type': 'code_review',
            'format': 'JSONL',
            'train_split': 80,
            'val_split': 15,
            'test_split': 5
        }
        
        response = requests.post(f"{BASE_URL}/upload", files=files, data=data)
        
        if response.status_code == 200:
            print("✅ Upload Successful")
            print(response.json())
        else:
            print(f"❌ Upload Failed: {response.status_code}")
            print(response.text)
            
    except Exception as e:
        print(f"❌ Error: {e}")
    finally:
        if os.path.exists("test_dataset.jsonl"):
            os.remove("test_dataset.jsonl")

def test_list_datasets():
    print("\nTesting List Datasets...")
    try:
        response = requests.get(f"{BASE_URL}/")
        if response.status_code == 200:
            print("✅ List Successful")
            datasets = response.json().get("datasets", [])
            print(f"Found {len(datasets)} datasets")
        else:
            print(f"❌ List Failed: {response.status_code}")
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    # Note: Server must be running for this to work
    print("⚠️  Ensure backend is running on localhost:8000")
    # We can't easily run the server here in this environment without blocking, 
    # so this script is for the user to run or for us to run if we had a background process tool.
    # However, since I modified the code, I can't verify it live without the server running.
    # I will just output the code for the user to verify.
    pass
