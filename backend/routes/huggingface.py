"""
HuggingFace Dataset Import - Git-clone style dataset importing
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict, List, Any
import os
import json
from datetime import datetime
import asyncio

router = APIRouter()

# Note: In production, install datasets library: pip install datasets
# For now, we'll create a mock implementation that can be easily replaced

class DatasetSearchResult(BaseModel):
    name: str
    description: str
    downloads: int
    likes: int
    tags: List[str]
    size: Optional[str] = None

class DatasetInfo(BaseModel):
    name: str
    description: str
    splits: List[str]
    features: Dict[str, str]
    num_rows: Dict[str, int]
    size_in_bytes: Optional[int] = None

class FieldMapping(BaseModel):
    source_field: str
    target_field: str  # 'prompt', 'completion', 'chosen', 'rejected', etc.

class ImportRequest(BaseModel):
    dataset_name: str
    split: str = "train"
    subset: Optional[str] = None
    field_mappings: List[FieldMapping]
    max_samples: Optional[int] = None  # Limit number of samples to import

class ImportProgress(BaseModel):
    status: str  # 'downloading', 'converting', 'saving', 'complete', 'error'
    progress: int  # 0-100
    message: str
    samples_processed: int = 0
    total_samples: int = 0

# Storage for import progress (in production, use Redis or similar)
import_progress_store: Dict[str, ImportProgress] = {}

@router.get("/search")
async def search_datasets(query: str, limit: int = 10):
    """
    Search HuggingFace Hub for datasets.
    In production, this calls HuggingFace API.
    """
    # Mock popular datasets for demo
    mock_datasets = [
        {
            "name": "HuggingFaceH4/ultrafeedback_binarized",
            "description": "UltraFeedback dataset with binary preferences for DPO training",
            "downloads": 50000,
            "likes": 234,
            "tags": ["dpo", "rlhf", "preferences"],
            "size": "500 MB"
        },
        {
            "name": "HuggingFaceH4/no_robots",
            "description": "High-quality human-generated conversations",
            "downloads": 30000,
            "likes": 156,
            "tags": ["conversation", "supervised-learning"],
            "size": "100 MB"
        },
        {
            "name": "openai/gsm8k",
            "description": "Grade school math word problems",
            "downloads": 80000,
            "likes": 412,
            "tags": ["math", "reasoning"],
            "size": "50 MB"
        },
        {
            "name": "bigcode/the-stack",
            "description": "Large dataset of source code in 30+ languages",
            "downloads": 100000,
            "likes": 567,
            "tags": ["code", "programming"],
            "size": "6 TB"
        },
        {
            "name": "tatsu-lab/alpaca",
            "description": "52K instruction-following demonstrations",
            "downloads": 120000,
            "likes": 892,
            "tags": ["instruction", "supervised-learning"],
            "size": "25 MB"
        }
    ]

    # Filter by query
    if query:
        filtered = [d for d in mock_datasets if query.lower() in d["name"].lower() or query.lower() in d["description"].lower()]
    else:
        filtered = mock_datasets

    return {"datasets": filtered[:limit]}

@router.get("/info/{dataset_name:path}")
async def get_dataset_info(dataset_name: str):
    """
    Get detailed information about a dataset.
    """
    # Mock dataset info (in production, load from HuggingFace)
    mock_info = {
        "HuggingFaceH4/ultrafeedback_binarized": {
            "name": "HuggingFaceH4/ultrafeedback_binarized",
            "description": "UltraFeedback dataset with binary preferences for DPO training",
            "splits": ["train", "test"],
            "features": {
                "prompt": "string",
                "chosen": "string",
                "rejected": "string",
                "score_chosen": "float",
                "score_rejected": "float"
            },
            "num_rows": {"train": 61135, "test": 2000},
            "size_in_bytes": 524288000
        },
        "HuggingFaceH4/no_robots": {
            "name": "HuggingFaceH4/no_robots",
            "description": "High-quality human-generated conversations",
            "splits": ["train", "test"],
            "features": {
                "messages": "list",
                "category": "string",
                "source": "string"
            },
            "num_rows": {"train": 9500, "test": 500},
            "size_in_bytes": 104857600
        },
        "openai/gsm8k": {
            "name": "openai/gsm8k",
            "description": "Grade school math word problems",
            "splits": ["train", "test"],
            "features": {
                "question": "string",
                "answer": "string"
            },
            "num_rows": {"train": 7473, "test": 1319},
            "size_in_bytes": 52428800
        }
    }

    if dataset_name not in mock_info:
        raise HTTPException(status_code=404, detail="Dataset not found")

    return mock_info[dataset_name]

@router.post("/suggest-mapping")
async def suggest_field_mapping(dataset_name: str, training_type: str = "SL"):
    """
    Suggest field mappings based on dataset structure and training type.
    """
    # Get dataset info to see available fields
    try:
        info = await get_dataset_info(dataset_name)
    except:
        raise HTTPException(status_code=404, detail="Dataset not found")

    features = info.get("features", {})
    suggestions = []

    # Common field name patterns
    prompt_fields = ["prompt", "question", "input", "instruction", "query", "text", "context"]
    completion_fields = ["completion", "answer", "output", "response", "target"]
    chosen_fields = ["chosen", "winner", "preferred", "positive"]
    rejected_fields = ["rejected", "loser", "not_preferred", "negative"]

    if training_type in ["DPO", "RLHF"]:
        # Need: prompt, chosen, rejected
        for field in features.keys():
            field_lower = field.lower()
            if any(p in field_lower for p in prompt_fields):
                suggestions.append({"source_field": field, "target_field": "prompt", "confidence": 0.9})
            if any(p in field_lower for p in chosen_fields):
                suggestions.append({"source_field": field, "target_field": "chosen", "confidence": 0.9})
            if any(p in field_lower for p in rejected_fields):
                suggestions.append({"source_field": field, "target_field": "rejected", "confidence": 0.9})
    else:
        # SL/RL: Need prompt, completion
        for field in features.keys():
            field_lower = field.lower()
            if any(p in field_lower for p in prompt_fields):
                suggestions.append({"source_field": field, "target_field": "prompt", "confidence": 0.9})
            if any(p in field_lower for p in completion_fields):
                suggestions.append({"source_field": field, "target_field": "completion", "confidence": 0.9})

    return {"suggestions": suggestions, "features": features}

@router.post("/preview")
async def preview_dataset(
    dataset_name: str,
    split: str = "train",
    num_samples: int = 5,
    field_mappings: Optional[List[Dict[str, str]]] = None
):
    """
    Preview dataset with applied field mappings.
    """
    # Mock preview data
    mock_previews = {
        "HuggingFaceH4/ultrafeedback_binarized": [
            {
                "prompt": "Explain quantum computing in simple terms",
                "chosen": "Quantum computing uses quantum mechanics principles to process information. Unlike classical computers that use bits (0 or 1), quantum computers use quantum bits or 'qubits' that can exist in multiple states simultaneously...",
                "rejected": "Quantum computing is computers that are really fast and use quantum stuff."
            },
            {
                "prompt": "What are the benefits of exercise?",
                "chosen": "Regular exercise provides numerous benefits including improved cardiovascular health, stronger muscles and bones, better mental health, weight management, and reduced risk of chronic diseases...",
                "rejected": "Exercise makes you feel good and lose weight."
            }
        ],
        "HuggingFaceH4/no_robots": [
            {
                "prompt": "How do I learn Python programming?",
                "completion": "To learn Python programming, I recommend: 1) Start with official Python tutorial, 2) Practice on coding platforms like LeetCode, 3) Build small projects, 4) Read others' code, 5) Join Python communities."
            },
            {
                "prompt": "What's the best way to prepare for a job interview?",
                "completion": "Here are key interview preparation steps: 1) Research the company thoroughly, 2) Practice common interview questions, 3) Prepare your own questions, 4) Review your resume and be ready to discuss experiences, 5) Dress appropriately and arrive early."
            }
        ]
    }

    preview_data = mock_previews.get(dataset_name, [])[:num_samples]

    return {
        "dataset_name": dataset_name,
        "split": split,
        "samples": preview_data,
        "total_samples": len(preview_data)
    }

@router.post("/import", response_model=Dict[str, Any])
async def import_dataset(request: ImportRequest):
    """
    Import dataset from HuggingFace Hub.
    This is the main import function that downloads and converts the dataset.
    """
    import_id = f"import_{datetime.now().strftime('%Y%m%d_%H%M%S')}"

    try:
        # Initialize progress
        import_progress_store[import_id] = ImportProgress(
            status="downloading",
            progress=10,
            message=f"Downloading {request.dataset_name} ({request.split} split)...",
            samples_processed=0,
            total_samples=0
        )

        # Simulate download progress
        await asyncio.sleep(1)
        import_progress_store[import_id].progress = 30
        import_progress_store[import_id].message = "Download complete. Converting to app format..."

        # In production, this would call:
        # from datasets import load_dataset
        # dataset = load_dataset(request.dataset_name, request.subset, split=request.split)

        # For now, use mock data
        await asyncio.sleep(1)
        import_progress_store[import_id].status = "converting"
        import_progress_store[import_id].progress = 50

        # Convert data using field mappings
        mock_data = []
        num_samples = request.max_samples or 100  # Default to 100 for demo

        for i in range(num_samples):
            item = {}
            for mapping in request.field_mappings:
                # In production, this would map actual fields from the dataset
                if mapping.target_field == "prompt":
                    item["prompt"] = f"Sample prompt {i+1} from {request.dataset_name}"
                elif mapping.target_field == "completion":
                    item["completion"] = f"Sample completion {i+1}"
                elif mapping.target_field == "chosen":
                    item["chosen"] = f"Sample chosen response {i+1}"
                elif mapping.target_field == "rejected":
                    item["rejected"] = f"Sample rejected response {i+1}"

            mock_data.append(item)

            # Update progress
            if i % 10 == 0:
                import_progress_store[import_id].samples_processed = i
                import_progress_store[import_id].total_samples = num_samples
                import_progress_store[import_id].progress = 50 + int((i / num_samples) * 40)

        await asyncio.sleep(1)
        import_progress_store[import_id].status = "saving"
        import_progress_store[import_id].progress = 90
        import_progress_store[import_id].message = "Saving dataset to storage..."

        # Save to data storage
        data_dir = os.path.join(os.path.dirname(__file__), '../data')
        os.makedirs(data_dir, exist_ok=True)

        dataset_filename = f"{request.dataset_name.replace('/', '_')}_{request.split}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.jsonl"
        dataset_path = os.path.join(data_dir, dataset_filename)

        with open(dataset_path, 'w') as f:
            for item in mock_data:
                f.write(json.dumps(item) + '\n')

        # Complete
        import_progress_store[import_id].status = "complete"
        import_progress_store[import_id].progress = 100
        import_progress_store[import_id].message = "Import complete!"
        import_progress_store[import_id].samples_processed = num_samples
        import_progress_store[import_id].total_samples = num_samples

        return {
            "import_id": import_id,
            "dataset_id": dataset_filename,
            "dataset_name": request.dataset_name,
            "split": request.split,
            "num_samples": num_samples,
            "file_path": dataset_path,
            "status": "complete"
        }

    except Exception as e:
        import_progress_store[import_id] = ImportProgress(
            status="error",
            progress=0,
            message=f"Import failed: {str(e)}",
            samples_processed=0,
            total_samples=0
        )
        raise HTTPException(status_code=500, detail=f"Import failed: {str(e)}")

@router.get("/import-progress/{import_id}")
async def get_import_progress(import_id: str):
    """
    Get progress of an import operation.
    """
    if import_id not in import_progress_store:
        raise HTTPException(status_code=404, detail="Import ID not found")

    return import_progress_store[import_id]

@router.get("/popular")
async def get_popular_datasets():
    """
    Get list of popular/recommended datasets for different training types.
    """
    return {
        "DPO": [
            {
                "name": "HuggingFaceH4/ultrafeedback_binarized",
                "description": "Binary preference data for DPO",
                "samples": 61135,
                "recommended": True
            },
            {
                "name": "Anthropic/hh-rlhf",
                "description": "Helpful and harmless preferences",
                "samples": 160000,
                "recommended": True
            }
        ],
        "SL": [
            {
                "name": "HuggingFaceH4/no_robots",
                "description": "High-quality conversations",
                "samples": 9500,
                "recommended": True
            },
            {
                "name": "tatsu-lab/alpaca",
                "description": "Instruction-following demonstrations",
                "samples": 52000,
                "recommended": True
            }
        ],
        "Code": [
            {
                "name": "bigcode/the-stack",
                "description": "Large code dataset",
                "samples": 1000000,
                "recommended": False  # Very large
            },
            {
                "name": "openai/humaneval",
                "description": "Python code evaluation",
                "samples": 164,
                "recommended": True
            }
        ],
        "Math": [
            {
                "name": "openai/gsm8k",
                "description": "Grade school math problems",
                "samples": 8792,
                "recommended": True
            }
        ]
    }
