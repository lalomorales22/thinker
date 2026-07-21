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
        "suggested_filters": datautil.suggest_filters(rows),
        "sample_rows": rows[:5],
    }


class CommitRequest(BaseModel):
    staging_id: str
    name: str
    training_type: str = "sl"
    # target field -> source column (dot-paths allowed, e.g. "message.content")
    mapping: dict[str, str] = {}
    # Row filters, applied before mapping. [{"column","op","value"}]
    filters: list[dict[str, Any]] = []
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

    # Filter first: dropping junk rows before mapping means the mapping only
    # ever sees rows that are actually going to be trained on.
    rows, filter_stats = datautil.apply_filters(rows, req.filters)
    if not rows:
        raise HTTPException(400, "Every row was removed by the filters. Loosen them and try again.")

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
                 "redactions": redactions, "filters": req.filters, "filter_stats": filter_stats},
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
    filters: list[dict[str, Any]] = []


@router.post("/preview-mapping")
async def preview_mapping(req: PreviewMappingRequest):
    """Show the actual training examples a mapping would produce.

    This is the whole point of the flow: see real converted examples before
    committing, rather than discovering the mapping was wrong after training.
    """
    info = _staged.get(req.staging_id)
    if not info:
        raise HTTPException(404, "That upload has expired. Choose the file again.")

    # Sample wider than we display, because filters may remove most of it.
    rows = datautil.load_rows(info["path"], info["fmt"], limit=400)
    rows, filter_stats = datautil.apply_filters(rows, req.filters)
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
            "notes": check["notes"], "ok": check["ok"], "filter_stats": filter_stats}


# --- blending several datasets into one ---------------------------------------

class MixSource(BaseModel):
    dataset_id: str
    # Relative proportion. Normalised across sources, so 60/20/10/5/5 and
    # 6/2/1/0.5/0.5 mean the same thing.
    weight: float = 1.0


class MixRequest(BaseModel):
    sources: list[MixSource]
    name: str = "Mixed dataset"
    # 0 means "as many rows as these ratios allow".
    target_rows: int = 0
    shuffle: bool = True
    seed: int = 42


def _plan_mix(req: MixRequest) -> dict[str, Any]:
    """Work out how many rows to take from each source.

    Ratios are a promise about composition, so the achievable total is capped by
    whichever source runs out first — asking for 60% of something with 100 rows
    limits the whole blend. The alternative (quietly under-filling one source)
    would hand back a mix that isn't the mix you asked for.
    """
    if not req.sources:
        raise HTTPException(400, "Pick at least one dataset to mix.")

    entries = []
    for s in req.sources:
        ds = db.get_dataset(s.dataset_id)
        if not ds:
            raise HTTPException(404, f"Dataset {s.dataset_id} no longer exists.")
        if s.weight <= 0:
            continue
        entries.append({"dataset": ds, "weight": float(s.weight)})
    if not entries:
        raise HTTPException(400, "Give at least one dataset a weight above zero.")

    types = {e["dataset"]["training_type"] for e in entries}
    if len(types) > 1:
        raise HTTPException(
            400,
            "These datasets train different ways (" + ", ".join(sorted(types)) +
            "). A supervised set and a preference set can't be blended — the "
            "trainer reads them differently.",
        )

    total_weight = sum(e["weight"] for e in entries)
    for e in entries:
        e["fraction"] = e["weight"] / total_weight
        e["available"] = int(e["dataset"].get("num_samples") or 0)
        # How large the whole blend could be if this source were the constraint.
        e["ceiling"] = e["available"] / e["fraction"] if e["fraction"] > 0 else 0

    limiter = min(entries, key=lambda e: e["ceiling"])
    achievable = int(limiter["ceiling"])
    total = min(achievable, req.target_rows) if req.target_rows > 0 else achievable

    for e in entries:
        e["taking"] = min(e["available"], int(round(e["fraction"] * total)))

    return {
        "entries": entries,
        "total": sum(e["taking"] for e in entries),
        "achievable": achievable,
        "limiting": limiter["dataset"]["name"],
        "training_type": types.pop(),
    }


def _mix_summary(plan: dict[str, Any]) -> list[dict[str, Any]]:
    total = plan["total"] or 1
    return [{
        "dataset_id": e["dataset"]["id"],
        "name": e["dataset"]["name"],
        "requested_pct": round(e["fraction"] * 100, 1),
        "actual_pct": round(e["taking"] / total * 100, 1),
        "available": e["available"],
        "taking": e["taking"],
        "exhausted": e["taking"] >= e["available"],
    } for e in plan["entries"]]


@router.post("/mix/preview")
async def mix_preview(req: MixRequest):
    """Show the blend you'd get, without writing anything."""
    plan = _plan_mix(req)
    samples = []
    for e in plan["entries"][:4]:
        ds = e["dataset"]
        try:
            rows = datautil.load_rows(ds["path"], ds.get("format") or "jsonl", limit=1)
        except Exception:
            rows = []
        if rows:
            samples.append({"from": ds["name"], "row": rows[0]})
    return {
        "sources": _mix_summary(plan),
        "total": plan["total"],
        "achievable": plan["achievable"],
        "limiting": plan["limiting"],
        "training_type": plan["training_type"],
        "samples": samples,
    }


@router.post("/mix")
async def mix_datasets(req: MixRequest):
    """Write the blend out as a single new dataset."""
    import random

    plan = _plan_mix(req)
    rng = random.Random(req.seed)
    out: list[dict[str, Any]] = []

    for e in plan["entries"]:
        ds = e["dataset"]
        rows = datautil.load_rows(ds["path"], ds.get("format") or "jsonl")
        take = min(e["taking"], len(rows))
        picked = rng.sample(rows, take) if take < len(rows) else list(rows)
        for r in picked:
            # Keep provenance so a blend can be traced back to its parts.
            out.append({**r, "_source": ds["name"]})

    if not out:
        raise HTTPException(400, "That mix produces no rows.")

    # Interleave. Left blocked, the model would see every empathetic example
    # before its first joke, and the tail of training would dominate the result.
    if req.shuffle:
        rng.shuffle(out)

    tt = plan["training_type"]
    check = datautil.validate(out, tt if tt in ("sl", "dpo", "rl") else "sl")
    dataset_id = str(uuid.uuid4())
    path = str(DATASETS_DIR / f"{dataset_id}_mixed.jsonl")
    with open(path, "w", encoding="utf-8") as f:
        for r in out:
            f.write(json.dumps(r, ensure_ascii=False, default=str) + "\n")

    num = len(out)
    rec = {
        "id": dataset_id, "name": req.name.strip() or "Mixed dataset", "source": "mixed",
        "training_type": tt, "format": "jsonl", "path": path, "num_samples": num,
        "size_bytes": os.path.getsize(path), "columns": check["columns"],
        "split": {"train": int(num * 0.9), "validation": num - int(num * 0.9), "test": 0},
        "schema_ok": check["ok"], "schema_notes": check["notes"],
        "meta": {"mix": _mix_summary(plan), "seed": req.seed, "shuffled": req.shuffle},
        "created_at": _now(),
    }
    dataset = db.add_dataset(rec)
    logger.info(f"Mixed {len(plan['entries'])} datasets -> '{rec['name']}' ({num} rows)")
    return {"dataset": dataset, "sources": _mix_summary(plan)}


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
