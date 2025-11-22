"""
Dataset management routes
"""
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Header
from pydantic import BaseModel
from typing import List, Optional
import os
import shutil
from datetime import datetime
import uuid
import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from utils import logger, DatasetNotFoundException, DatasetValidationException

router = APIRouter()

# In-memory storage for demo (would be DB in prod)
datasets = []
DATA_DIR = "data_storage"  # Directory to store uploaded files

# Ensure data directory exists
os.makedirs(DATA_DIR, exist_ok=True)

class Dataset(BaseModel):
    id: str
    name: str
    type: str
    format: str
    size: str
    numSamples: int
    split: dict
    uploadedAt: str

@router.get("/")
async def list_datasets():
    """List all datasets"""
    logger.debug(f"Listing datasets. Total count: {len(datasets)}")
    return {"datasets": datasets}

@router.post("/upload")
async def upload_dataset(
    file: UploadFile = File(...),
    name: str = Form(...),
    type: str = Form(...),
    format: str = Form(...),
    train_split: int = Form(80),
    val_split: int = Form(15),
    test_split: int = Form(5),
    x_api_key: Optional[str] = Header(None)
):
    """Upload a new dataset"""
    logger.info(f"Dataset upload started: {name} ({format})")

    # Set API key if provided
    api_key = x_api_key or os.getenv("TINKER_API_KEY")
    if api_key:
        os.environ["TINKER_API_KEY"] = api_key

    try:
        # Validate splits sum to 100
        total_split = train_split + val_split + test_split
        if total_split != 100:
            raise DatasetValidationException(
                f"Splits must sum to 100%, got {total_split}%"
            )

        # Validate format
        valid_formats = ['jsonl', 'json', 'csv']
        if format not in valid_formats:
            raise DatasetValidationException(
                f"Invalid format '{format}'. Must be one of: {', '.join(valid_formats)}"
            )

        # Generate ID
        dataset_id = str(uuid.uuid4())
        logger.debug(f"Generated dataset ID: {dataset_id}")

        # Save file
        file_path = os.path.join(DATA_DIR, f"{dataset_id}_{file.filename}")
        logger.debug(f"Saving file to: {file_path}")

        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # Get file size
        size_bytes = os.path.getsize(file_path)
        size_str = f"{size_bytes / 1024:.1f} KB"
        if size_bytes > 1024 * 1024:
            size_str = f"{size_bytes / (1024 * 1024):.1f} MB"

        logger.debug(f"File size: {size_str}")

        # Count lines (approx samples)
        num_samples = 0
        try:
            with open(file_path, "r", encoding='utf-8') as f:
                for _ in f:
                    num_samples += 1
        except UnicodeDecodeError:
            logger.warning(f"File encoding issue, trying latin-1")
            with open(file_path, "r", encoding='latin-1') as f:
                for _ in f:
                    num_samples += 1

        logger.info(f"Dataset contains {num_samples} samples")

        # Create dataset record
        new_dataset = {
            "id": dataset_id,
            "name": name,
            "type": type,
            "format": format,
            "size": size_str,
            "numSamples": num_samples,
            "split": {
                "train": int(num_samples * (train_split / 100)),
                "validation": int(num_samples * (val_split / 100)),
                "test": int(num_samples * (test_split / 100))
            },
            "uploadedAt": datetime.now().strftime("%Y-%m-%d %H:%M"),
            "path": file_path
        }

        datasets.append(new_dataset)
        logger.info(f"Dataset '{name}' uploaded successfully. ID: {dataset_id}")

        return {
            "message": "Dataset uploaded successfully",
            "dataset": new_dataset
        }

    except DatasetValidationException:
        # Re-raise custom exceptions
        raise
    except Exception as e:
        logger.error(f"Dataset upload failed: {str(e)}", exc_info=True)
        # Clean up file if it was created
        if 'file_path' in locals() and os.path.exists(file_path):
            try:
                os.remove(file_path)
                logger.debug(f"Cleaned up failed upload file: {file_path}")
            except Exception as cleanup_error:
                logger.warning(f"Failed to clean up file: {cleanup_error}")

        raise HTTPException(
            status_code=500,
            detail=f"Dataset upload failed: {str(e)}"
        )
