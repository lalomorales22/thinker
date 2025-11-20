"""
Dataset management routes
"""
from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import os
import shutil
from datetime import datetime
import uuid

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
    return {"datasets": datasets}

@router.post("/upload")
async def upload_dataset(
    file: UploadFile = File(...),
    name: str = Form(...),
    type: str = Form(...),
    format: str = Form(...),
    train_split: int = Form(80),
    val_split: int = Form(15),
    test_split: int = Form(5)
):
    """Upload a new dataset"""
    try:
        # Generate ID
        dataset_id = str(uuid.uuid4())
        
        # Save file
        file_path = os.path.join(DATA_DIR, f"{dataset_id}_{file.filename}")
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        # Get file size
        size_bytes = os.path.getsize(file_path)
        size_str = f"{size_bytes / 1024:.1f} KB"
        if size_bytes > 1024 * 1024:
            size_str = f"{size_bytes / (1024 * 1024):.1f} MB"
            
        # Count lines (approx samples)
        num_samples = 0
        with open(file_path, "r") as f:
            for _ in f:
                num_samples += 1
                
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
        
        return {
            "message": "Dataset uploaded successfully",
            "dataset": new_dataset
        }
        
    except Exception as e:
        print(f"Upload failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
