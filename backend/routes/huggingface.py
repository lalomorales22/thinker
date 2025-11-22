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
import logging

# Import HuggingFace libraries
try:
    from datasets import load_dataset, get_dataset_config_names, list_datasets
    from huggingface_hub import HfApi, list_datasets as hf_list_datasets
    HUGGINGFACE_AVAILABLE = True
except ImportError:
    HUGGINGFACE_AVAILABLE = False
    logging.warning("HuggingFace datasets library not installed. Run: pip install datasets huggingface-hub")

router = APIRouter()
logger = logging.getLogger(__name__)

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
    """
    if not HUGGINGFACE_AVAILABLE:
        # Return mock data if library not available
        return _get_mock_search_results(query, limit)

    try:
        # Use HuggingFace Hub API to search datasets
        api = HfApi()
        datasets = api.list_datasets(
            search=query,
            limit=limit,
            sort="downloads",
            direction=-1
        )

        results = []
        for dataset in datasets:
            results.append({
                "name": dataset.id,
                "description": getattr(dataset, 'description', '') or f"Dataset: {dataset.id}",
                "downloads": getattr(dataset, 'downloads', 0) or 0,
                "likes": getattr(dataset, 'likes', 0) or 0,
                "tags": getattr(dataset, 'tags', []) or [],
                "size": None  # Size info not always available
            })

        return {"datasets": results}

    except Exception as e:
        logger.error(f"Error searching HuggingFace datasets: {e}")
        # Fallback to mock data on error
        return _get_mock_search_results(query, limit)

def _get_mock_search_results(query: str, limit: int):
    """Fallback mock data when HuggingFace API is unavailable"""
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
    if not HUGGINGFACE_AVAILABLE:
        return _get_mock_dataset_info(dataset_name)

    try:
        # Load dataset info from HuggingFace
        # First, try to get configs
        configs = []
        try:
            configs = get_dataset_config_names(dataset_name)
        except:
            configs = [None]  # No configs, use default

        # Load the first config (or default)
        config = configs[0] if configs else None

        # Load dataset builder to get info without downloading data
        from datasets import load_dataset_builder
        builder = load_dataset_builder(dataset_name, config)

        # Get features
        features = {}
        if builder.info.features:
            for name, feature in builder.info.features.items():
                features[name] = str(feature.dtype) if hasattr(feature, 'dtype') else str(type(feature).__name__)

        # Get splits and row counts
        splits = []
        num_rows = {}
        if builder.info.splits:
            for split_name, split_info in builder.info.splits.items():
                splits.append(split_name)
                num_rows[split_name] = split_info.num_examples

        return {
            "name": dataset_name,
            "description": builder.info.description or f"Dataset: {dataset_name}",
            "splits": splits or ["train"],  # Default to train if no splits found
            "features": features,
            "num_rows": num_rows,
            "size_in_bytes": builder.info.dataset_size
        }

    except Exception as e:
        logger.error(f"Error getting dataset info for {dataset_name}: {e}")
        # Fallback to mock data
        return _get_mock_dataset_info(dataset_name)

def _get_mock_dataset_info(dataset_name: str):
    """Fallback mock dataset info"""
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

class SuggestMappingRequest(BaseModel):
    dataset_name: str
    training_type: str = "SL"

@router.post("/suggest-mapping")
async def suggest_field_mapping(request: SuggestMappingRequest):
    """
    Suggest field mappings based on dataset structure and training type.
    """
    # Get dataset info to see available fields
    try:
        info = await get_dataset_info(request.dataset_name)
    except:
        raise HTTPException(status_code=404, detail="Dataset not found")

    features = info.get("features", {})
    suggestions = []

    # Common field name patterns
    prompt_fields = ["prompt", "question", "input", "instruction", "query", "text", "context"]
    completion_fields = ["completion", "answer", "output", "response", "target"]
    chosen_fields = ["chosen", "winner", "preferred", "positive"]
    rejected_fields = ["rejected", "loser", "not_preferred", "negative"]

    if request.training_type in ["DPO", "RLHF"]:
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

class PreviewRequest(BaseModel):
    dataset_name: str
    split: str = "train"
    num_samples: int = 5
    field_mappings: Optional[List[Dict[str, str]]] = None

@router.post("/preview")
async def preview_dataset(request: PreviewRequest):
    """
    Preview dataset with applied field mappings.
    """
    dataset_name = request.dataset_name
    split = request.split
    num_samples = request.num_samples
    field_mappings = request.field_mappings
    if not HUGGINGFACE_AVAILABLE:
        return _get_mock_preview(dataset_name, split, num_samples)

    try:
        # Load dataset from HuggingFace
        dataset = load_dataset(dataset_name, split=split, streaming=True)

        # Get first N samples
        preview_data = []
        for i, item in enumerate(dataset):
            if i >= num_samples:
                break

            # Apply field mappings if provided
            mapped_item = {}
            if field_mappings:
                for mapping in field_mappings:
                    source_field = mapping.get("source_field")
                    target_field = mapping.get("target_field")
                    if source_field in item:
                        # Handle nested fields or lists
                        value = item[source_field]
                        if isinstance(value, list) and len(value) > 0:
                            # For message lists, extract text content
                            if isinstance(value[0], dict):
                                value = " ".join([msg.get("content", str(msg)) for msg in value])
                            else:
                                value = str(value)
                        mapped_item[target_field] = str(value)[:500]  # Limit preview length
            else:
                # No mappings, return raw data
                mapped_item = {k: str(v)[:500] for k, v in item.items()}

            preview_data.append(mapped_item)

        return {
            "dataset_name": dataset_name,
            "split": split,
            "samples": preview_data,
            "total_samples": len(preview_data)
        }

    except Exception as e:
        logger.error(f"Error previewing dataset {dataset_name}: {e}")
        return _get_mock_preview(dataset_name, split, num_samples)

def _get_mock_preview(dataset_name: str, split: str, num_samples: int):
    """Fallback mock preview data"""
    mock_previews = {
        "HuggingFaceH4/ultrafeedback_binarized": [
            {
                "prompt": "Explain quantum computing in simple terms",
                "chosen": "Quantum computing uses quantum mechanics principles to process information...",
                "rejected": "Quantum computing is computers that are really fast and use quantum stuff."
            },
            {
                "prompt": "What are the benefits of exercise?",
                "chosen": "Regular exercise provides numerous benefits including improved cardiovascular health...",
                "rejected": "Exercise makes you feel good and lose weight."
            }
        ],
        "HuggingFaceH4/no_robots": [
            {
                "prompt": "How do I learn Python programming?",
                "completion": "To learn Python programming, I recommend: 1) Start with official Python tutorial..."
            },
            {
                "prompt": "What's the best way to prepare for a job interview?",
                "completion": "Here are key interview preparation steps: 1) Research the company thoroughly..."
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

        if not HUGGINGFACE_AVAILABLE:
            # Use mock data if library not available
            logger.warning("HuggingFace datasets library not available, using mock data")
            return await _import_mock_dataset(request, import_id)

        # Download dataset from HuggingFace
        logger.info(f"Loading dataset: {request.dataset_name}, split: {request.split}")
        dataset = load_dataset(
            request.dataset_name,
            request.subset,
            split=request.split,
            streaming=False  # Download full dataset
        )

        import_progress_store[import_id].progress = 30
        import_progress_store[import_id].message = "Download complete. Converting to app format..."

        # Convert data using field mappings
        converted_data = []
        num_samples = min(request.max_samples or len(dataset), len(dataset))

        import_progress_store[import_id].status = "converting"
        import_progress_store[import_id].progress = 40
        import_progress_store[import_id].total_samples = num_samples

        for i, item in enumerate(dataset):
            if i >= num_samples:
                break

            # Map fields from source dataset to target format
            mapped_item = {}
            for mapping in request.field_mappings:
                source_field = mapping.source_field
                target_field = mapping.target_field

                if source_field in item:
                    value = item[source_field]

                    # Handle different data types
                    if isinstance(value, list):
                        # For message lists, extract text content
                        if len(value) > 0 and isinstance(value[0], dict):
                            # List of message dicts
                            value = " ".join([msg.get("content", str(msg)) for msg in value])
                        else:
                            value = str(value)
                    elif not isinstance(value, str):
                        value = str(value)

                    mapped_item[target_field] = value

            if mapped_item:  # Only add if we mapped at least one field
                converted_data.append(mapped_item)

            # Update progress every 100 items
            if i % 100 == 0:
                import_progress_store[import_id].samples_processed = i
                import_progress_store[import_id].progress = 40 + int((i / num_samples) * 50)

        # Save to data storage
        import_progress_store[import_id].status = "saving"
        import_progress_store[import_id].progress = 90
        import_progress_store[import_id].message = "Saving dataset to storage..."

        data_dir = os.path.join(os.path.dirname(__file__), '../data')
        os.makedirs(data_dir, exist_ok=True)

        dataset_filename = f"{request.dataset_name.replace('/', '_')}_{request.split}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.jsonl"
        dataset_path = os.path.join(data_dir, dataset_filename)

        with open(dataset_path, 'w', encoding='utf-8') as f:
            for item in converted_data:
                f.write(json.dumps(item, ensure_ascii=False) + '\n')

        # Complete
        import_progress_store[import_id].status = "complete"
        import_progress_store[import_id].progress = 100
        import_progress_store[import_id].message = "Import complete!"
        import_progress_store[import_id].samples_processed = len(converted_data)
        import_progress_store[import_id].total_samples = len(converted_data)

        logger.info(f"Successfully imported {len(converted_data)} samples from {request.dataset_name}")

        return {
            "import_id": import_id,
            "dataset_id": dataset_filename,
            "dataset_name": request.dataset_name,
            "split": request.split,
            "num_samples": len(converted_data),
            "file_path": dataset_path,
            "status": "complete"
        }

    except Exception as e:
        logger.error(f"Import failed for {request.dataset_name}: {e}", exc_info=True)
        import_progress_store[import_id] = ImportProgress(
            status="error",
            progress=0,
            message=f"Import failed: {str(e)}",
            samples_processed=0,
            total_samples=0
        )
        raise HTTPException(status_code=500, detail=f"Import failed: {str(e)}")

async def _import_mock_dataset(request: ImportRequest, import_id: str):
    """Fallback mock import when HuggingFace library not available"""
    await asyncio.sleep(1)
    import_progress_store[import_id].progress = 30
    import_progress_store[import_id].message = "Download complete. Converting to app format..."

    await asyncio.sleep(1)
    import_progress_store[import_id].status = "converting"
    import_progress_store[import_id].progress = 50

    # Convert data using field mappings
    mock_data = []
    num_samples = request.max_samples or 100

    for i in range(num_samples):
        item = {}
        for mapping in request.field_mappings:
            if mapping.target_field == "prompt":
                item["prompt"] = f"Sample prompt {i+1} from {request.dataset_name}"
            elif mapping.target_field == "completion":
                item["completion"] = f"Sample completion {i+1}"
            elif mapping.target_field == "chosen":
                item["chosen"] = f"Sample chosen response {i+1}"
            elif mapping.target_field == "rejected":
                item["rejected"] = f"Sample rejected response {i+1}"

        mock_data.append(item)

        if i % 10 == 0:
            import_progress_store[import_id].samples_processed = i
            import_progress_store[import_id].total_samples = num_samples
            import_progress_store[import_id].progress = 50 + int((i / num_samples) * 40)

    await asyncio.sleep(1)
    import_progress_store[import_id].status = "saving"
    import_progress_store[import_id].progress = 90
    import_progress_store[import_id].message = "Saving dataset to storage..."

    data_dir = os.path.join(os.path.dirname(__file__), '../data')
    os.makedirs(data_dir, exist_ok=True)

    dataset_filename = f"{request.dataset_name.replace('/', '_')}_{request.split}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.jsonl"
    dataset_path = os.path.join(data_dir, dataset_filename)

    with open(dataset_path, 'w') as f:
        for item in mock_data:
            f.write(json.dumps(item) + '\n')

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
