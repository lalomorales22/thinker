"""
Dataset routes — upload, hand-create, preview, validate, list, delete.

Everything is DB-backed and written to ONE unified storage folder
(config.DATASETS_DIR), the same place HuggingFace imports land, so the trainer
can always find a dataset by id. Uploaded content is validated against the
chosen training type up-front and the result is stored, so the UI can tell a
beginner exactly what (if anything) is wrong before they try to train.
"""
from __future__ import annotations

import itertools
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
from training import datautil, secrets
from utils import logger

router = APIRouter()

VALID_FORMATS = {"jsonl", "json", "csv"}
VALID_TYPES = {"sl", "dpo", "rl", "any"}

# Files held between /inspect and /commit. Staged content lives on disk under
# DATASETS_DIR/.staging so a big upload isn't kept in memory, and is only
# promoted to a real dataset once the user has seen what's in it.
STAGING_DIR = DATASETS_DIR / ".staging"
STAGING_DIR.mkdir(parents=True, exist_ok=True)
_staged: dict[str, dict[str, Any]] = {}
# Rows parsed for analysis. Anything beyond this is imported but not inspected.
INSPECT_LIMIT = 2000


def _discard_staged(staging_id: str) -> None:
    info = _staged.pop(staging_id, None)
    if info and os.path.exists(info["path"]):
        try:
            os.remove(info["path"])
        except OSError:
            pass


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


# --- inspect → map → preview → commit ----------------------------------------

@router.post("/inspect")
async def inspect_dataset(file: UploadFile = File(...), format: str = Form("")):
    """Parse an uploaded file and report what's in it — storing nothing permanent.

    The old flow imported first and validated after, so a file whose columns
    didn't match became a dataset flagged broken only once it was already in
    your list. This answers the questions up front: what columns are here, what
    can it train, what would a real example look like, and does it contain
    credentials that shouldn't be uploaded anywhere.
    """
    fname = os.path.basename(file.filename or "dataset.jsonl")
    fmt = (format or "").lower()
    if fmt not in VALID_FORMATS:
        lower = fname.lower()
        fmt = "csv" if lower.endswith(".csv") else "json" if lower.endswith(".json") else "jsonl"

    staging_id = f"stg_{uuid.uuid4().hex[:12]}"
    path = str(STAGING_DIR / f"{staging_id}_{fname}")
    try:
        with open(path, "wb") as buf:
            shutil.copyfileobj(file.file, buf)
    except Exception as e:
        raise HTTPException(500, f"Couldn't read the uploaded file: {e}")

    try:
        rows = datautil.load_rows(path, fmt, limit=INSPECT_LIMIT)
    except Exception as e:
        os.remove(path)
        raise HTTPException(400, f"Couldn't parse this as {fmt.upper()}: {e}")

    if not rows:
        os.remove(path)
        raise HTTPException(
            400,
            f"No rows found in {fname}. For JSONL each line must be a JSON object; "
            "for JSON it should be a list of objects; for CSV it needs a header row.",
        )

    fit = datautil.fit_from_rows(rows)
    scan = secrets.scan_rows(rows)
    columns = datautil.flatten_paths(rows[0]) if rows else []
    # Union of top-level keys and nested paths, so nested JSON is mappable too.
    for c in fit["columns"]:
        if c not in columns:
            columns.append(c)

    _staged[staging_id] = {"path": path, "fmt": fmt, "filename": fname,
                           "rows_sampled": len(rows), "created_at": _now()}

    return {
        "staging_id": staging_id,
        "filename": fname,
        "format": fmt,
        "rows_sampled": len(rows),
        "truncated": len(rows) >= INSPECT_LIMIT,
        "columns": columns,
        "fit": fit,
        "secrets": scan,
        "suggested_mapping": {
            tt: datautil.suggest_mapping(columns, tt) for tt in ("sl", "dpo", "rl")
        },
        "sample_rows": rows[:5],
    }


class CommitRequest(BaseModel):
    staging_id: str
    name: str
    training_type: str = "sl"
    # target field -> source column (dot-paths allowed, e.g. "message.content")
    mapping: dict[str, str] = {}
    train_split: int = 80
    val_split: int = 10
    test_split: int = 10
    # What to do about detected credentials: "keep" | "scrub" | "drop_rows"
    secrets_action: str = "scrub"


@router.post("/commit")
async def commit_staged(req: CommitRequest):
    """Turn an inspected file into a real, trainable dataset."""
    info = _staged.get(req.staging_id)
    if not info:
        raise HTTPException(404, "That upload has expired. Choose the file again.")
    tt = (req.training_type or "sl").lower()
    if tt not in VALID_TYPES:
        raise HTTPException(400, f"Invalid training type '{tt}'.")
    if req.train_split + req.val_split + req.test_split != 100:
        raise HTTPException(400, "Splits must add up to 100%.")

    rows = datautil.load_rows(info["path"], info["fmt"])
    if not rows:
        raise HTTPException(400, "No rows found in the staged file.")

    # Apply mapping additively — keep the original columns and add the aliases,
    # so data living in an unmapped column still reaches the trainer.
    if req.mapping:
        mapped = []
        for item in rows:
            row = dict(item)
            for target, source in req.mapping.items():
                if not source:
                    continue
                val = datautil.get_path(item, source)
                if val is not None:
                    row[target] = val
            mapped.append(row)
        rows = mapped

    # Handle credentials before anything is written to disk.
    scan = secrets.scan_rows(rows)
    redactions = 0
    if scan["count"]:
        if req.secrets_action == "drop_rows":
            affected = set(scan["affected_rows"])
            rows = [r for i, r in enumerate(rows) if i not in affected]
            if not rows:
                raise HTTPException(400, "Every row contained credentials, so nothing is left to import.")
        elif req.secrets_action != "keep":
            rows, redactions = secrets.scrub_rows(rows)

    check = datautil.validate(rows, tt if tt in ("sl", "dpo", "rl") else "sl")
    if not check["ok"]:
        raise HTTPException(
            400,
            f"After mapping, no rows can feed {tt.upper()} training. " + " ".join(check["notes"]),
        )

    dataset_id = str(uuid.uuid4())
    path = str(DATASETS_DIR / f"{dataset_id}_{os.path.splitext(info['filename'])[0]}.jsonl")
    with open(path, "w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False, default=str) + "\n")

    num = len(rows)
    rec = {
        "id": dataset_id, "name": req.name.strip() or info["filename"], "source": "upload",
        "training_type": tt, "format": "jsonl", "path": path, "num_samples": num,
        "size_bytes": os.path.getsize(path), "columns": check["columns"],
        "split": {
            "train": int(num * req.train_split / 100),
            "validation": int(num * req.val_split / 100),
            "test": num - int(num * req.train_split / 100) - int(num * req.val_split / 100),
        },
        "schema_ok": check["ok"], "schema_notes": check["notes"],
        "meta": {"original_filename": info["filename"], "mapping": req.mapping,
                 "secrets_found": scan["count"], "secrets_action": req.secrets_action,
                 "redactions": redactions},
        "created_at": _now(),
    }
    dataset = db.add_dataset(rec)
    _discard_staged(req.staging_id)
    logger.info(f"Committed '{rec['name']}' ({num} rows, {scan['count']} secrets, action={req.secrets_action})")
    return {"dataset": dataset, "secrets_found": scan["count"], "redactions": redactions}


@router.post("/discard/{staging_id}")
async def discard(staging_id: str):
    """Drop a staged file the user backed out of."""
    _discard_staged(staging_id)
    return {"message": "Discarded"}


class PreviewMappingRequest(BaseModel):
    staging_id: str
    training_type: str = "sl"
    mapping: dict[str, str] = {}


@router.post("/preview-mapping")
async def preview_mapping(req: PreviewMappingRequest):
    """Show the actual training examples a mapping would produce.

    This is the whole point of the flow: see real converted examples before
    committing, rather than discovering the mapping was wrong after training.
    """
    info = _staged.get(req.staging_id)
    if not info:
        raise HTTPException(404, "That upload has expired. Choose the file again.")

    rows = datautil.load_rows(info["path"], info["fmt"], limit=50)
    if req.mapping:
        mapped = []
        for item in rows:
            row = dict(item)
            for target, source in req.mapping.items():
                if not source:
                    continue
                val = datautil.get_path(item, source)
                if val is not None:
                    row[target] = val
            mapped.append(row)
        rows = mapped

    tt = (req.training_type or "sl").lower()
    check = datautil.validate(rows, tt if tt in ("sl", "dpo", "rl") else "sl")
    examples = list(itertools.islice(datautil.iter_examples(rows, tt), 3))
    return {"examples": examples, "usable": check["usable"], "sampled": len(rows),
            "notes": check["notes"], "ok": check["ok"]}


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
