"""
Dataset routes — upload, hand-create, preview, validate, list, delete.

Everything is DB-backed and written to ONE unified storage folder
(config.DATASETS_DIR), the same place HuggingFace imports land, so the trainer
can always find a dataset by id. Uploaded content is validated against the
chosen training type up-front and the result is stored, so the UI can tell a
beginner exactly what (if anything) is wrong before they try to train.
"""
from __future__ import annotations

import json
import os
import shutil
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

import db
from config import DATASETS_DIR
from training import datautil
from utils import logger

router = APIRouter()

VALID_FORMATS = {"jsonl", "json", "csv"}
VALID_TYPES = {"sl", "dpo", "rl", "any"}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _human_size(n: int) -> str:
    if n > 1024 * 1024:
        return f"{n / (1024 * 1024):.1f} MB"
    if n > 1024:
        return f"{n / 1024:.1f} KB"
    return f"{n} B"


def _record_from_file(name: str, path: str, fmt: str, training_type: str,
                      source: str, split: dict, meta: dict) -> dict[str, Any]:
    rows = datautil.load_rows(path, fmt, limit=5000)
    num = len(rows)
    check = datautil.validate(rows, training_type if training_type in ("sl", "dpo", "rl") else "sl")
    size = os.path.getsize(path) if os.path.exists(path) else 0
    total = num or 1
    return {
        "id": str(uuid.uuid4()),
        "name": name,
        "source": source,
        "training_type": training_type,
        "format": fmt,
        "path": path,
        "num_samples": num,
        "size_bytes": size,
        "columns": check["columns"],
        "split": split or {
            "train": int(total * 0.8), "validation": int(total * 0.1),
            "test": total - int(total * 0.8) - int(total * 0.1),
        },
        "schema_ok": check["ok"],
        "schema_notes": check["notes"],
        "meta": meta,
        "created_at": _now(),
    }


@router.get("/")
async def list_datasets():
    return {"datasets": db.list_datasets()}


@router.post("/upload")
async def upload_dataset(
    file: UploadFile = File(...),
    name: str = Form(...),
    training_type: str = Form("sl"),
    format: str = Form("jsonl"),
    train_split: int = Form(80),
    val_split: int = Form(10),
    test_split: int = Form(10),
):
    fmt = (format or "").lower()
    training_type = (training_type or "sl").lower()
    if fmt not in VALID_FORMATS:
        raise HTTPException(400, f"Invalid format '{fmt}'. Must be one of: {', '.join(VALID_FORMATS)}.")
    if training_type not in VALID_TYPES:
        raise HTTPException(400, f"Invalid training type '{training_type}'.")
    if train_split + val_split + test_split != 100:
        raise HTTPException(400, f"Splits must add up to 100% (got {train_split + val_split + test_split}%).")

    dataset_id = str(uuid.uuid4())
    safe_name = os.path.basename(file.filename or f"dataset.{fmt}")
    path = str(DATASETS_DIR / f"{dataset_id}_{safe_name}")
    try:
        with open(path, "wb") as buf:
            shutil.copyfileobj(file.file, buf)

        rows = datautil.load_rows(path, fmt, limit=5000)
        num = len(rows)
        if num == 0:
            raise HTTPException(400, "No rows were found in the file. Is the format correct?")
        check = datautil.validate(rows, training_type if training_type in ("sl", "dpo", "rl") else "sl")
        split = {
            "train": int(num * train_split / 100),
            "validation": int(num * val_split / 100),
            "test": num - int(num * train_split / 100) - int(num * val_split / 100),
        }
        rec = {
            "id": dataset_id, "name": name, "source": "upload", "training_type": training_type,
            "format": fmt, "path": path, "num_samples": num, "size_bytes": os.path.getsize(path),
            "columns": check["columns"], "split": split, "schema_ok": check["ok"],
            "schema_notes": check["notes"], "meta": {}, "created_at": _now(),
        }
        dataset = db.add_dataset(rec)
        logger.info(f"Uploaded dataset '{name}' ({num} rows, schema_ok={check['ok']})")
        return {"message": "Dataset uploaded", "dataset": dataset}
    except HTTPException:
        if os.path.exists(path):
            os.remove(path)
        raise
    except Exception as e:
        if os.path.exists(path):
            os.remove(path)
        logger.error(f"Upload failed: {e}", exc_info=True)
        raise HTTPException(500, f"Upload failed: {e}")


class CreateRequest(BaseModel):
    name: str
    training_type: str = "sl"
    rows: list[dict[str, Any]]


@router.post("/create")
async def create_dataset(req: CreateRequest):
    """Create a dataset from rows typed directly in the app (no file needed)."""
    tt = (req.training_type or "sl").lower()
    if tt not in VALID_TYPES:
        raise HTTPException(400, f"Invalid training type '{tt}'.")
    if not req.rows:
        raise HTTPException(400, "Add at least one example.")

    dataset_id = str(uuid.uuid4())
    path = str(DATASETS_DIR / f"{dataset_id}_{req.name.strip().replace(' ', '_')[:40] or 'dataset'}.jsonl")
    with open(path, "w", encoding="utf-8") as f:
        for row in req.rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")

    check = datautil.validate(req.rows, tt if tt in ("sl", "dpo", "rl") else "sl")
    num = len(req.rows)
    rec = {
        "id": dataset_id, "name": req.name, "source": "generated", "training_type": tt,
        "format": "jsonl", "path": path, "num_samples": num, "size_bytes": os.path.getsize(path),
        "columns": check["columns"],
        "split": {"train": int(num * 0.8), "validation": int(num * 0.1), "test": num - int(num * 0.8) - int(num * 0.1)},
        "schema_ok": check["ok"], "schema_notes": check["notes"], "meta": {}, "created_at": _now(),
    }
    return {"message": "Dataset created", "dataset": db.add_dataset(rec)}


@router.get("/templates")
async def templates():
    """Example rows + plain-language guidance for each training type."""
    return {
        "sl": {
            "label": "Supervised (teach by example)",
            "help": "Show the model example prompts and the exact answers you want. Great for style, formats, and 'do it like this'.",
            "example": {"prompt": "Summarize: The cat sat on the mat.", "completion": "A cat sat on a mat."},
            "also_accepts": ["messages: [{role, content}]", "input/output", "instruction/response", "question/answer"],
        },
        "dpo": {
            "label": "Preference / DPO (learn what's better)",
            "help": "Give a prompt with a better ('chosen') and worse ('rejected') answer. The model learns to prefer the better style.",
            "example": {"prompt": "Explain gravity to a child.",
                        "chosen": "Gravity is the pull that brings things down to the ground.",
                        "rejected": "Gravity is a fundamental interaction described by general relativity."},
            "also_accepts": ["preferred/negative", "response_a/response_b"],
        },
        "rl": {
            "label": "Reinforcement (learn by trying)",
            "help": "Give prompts (and optionally a reference answer). The model tries answers, gets scored by a reward, and improves.",
            "example": {"prompt": "What is 17 + 26?", "reference": "43"},
            "also_accepts": ["question/answer", "prompt only"],
        },
    }


@router.get("/{dataset_id}")
async def get_dataset(dataset_id: str):
    ds = db.get_dataset(dataset_id)
    if not ds:
        raise HTTPException(404, "Dataset not found")
    return ds


@router.get("/{dataset_id}/preview")
async def preview(dataset_id: str, n: int = 5):
    ds = db.get_dataset(dataset_id)
    if not ds:
        raise HTTPException(404, "Dataset not found")
    try:
        rows = datautil.load_rows(ds["path"], ds["format"], limit=max(1, min(n, 50)))
    except Exception as e:
        raise HTTPException(500, f"Could not read dataset: {e}")
    return {"dataset_id": dataset_id, "columns": ds.get("columns", []), "rows": rows}


@router.delete("/{dataset_id}")
async def delete_dataset(dataset_id: str):
    ds = db.get_dataset(dataset_id)
    if not ds:
        raise HTTPException(404, "Dataset not found")
    try:
        if ds.get("path") and os.path.exists(ds["path"]):
            os.remove(ds["path"])
    except OSError as e:
        logger.warning(f"Could not remove dataset file: {e}")
    db.delete_dataset(dataset_id)
    return {"message": f"Dataset {dataset_id} deleted"}
