"""
HuggingFace dataset import — wired straight into training, and robust to messy
schemas.

The old importer wrote a file to a stray folder and returned a filename, so
imported data could never be trained on. It also loaded data through the
`datasets` library's Arrow pipeline, which fails with "Couldn't cast … column
names don't match" on datasets whose rows/shards have heterogeneous shapes
(nulls, nested structs, tool-call records, …).

This version:
  - loads rows via HuggingFace's dataset-viewer API (plain JSON, schema-tolerant,
    no full download), falling back to the `datasets` library only if needed,
  - converts role-aware chat data instead of joining it into one blob,
  - validates the result against the chosen training type with a friendly message,
  - REGISTERS the dataset in the shared registry (db) + unified storage folder,
    so it appears in the dataset list and is immediately trainable.
"""
from __future__ import annotations

import itertools
import json
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

import db
from config import DATASETS_DIR
from training import datautil
from utils import logger

router = APIRouter()

VIEWER = "https://datasets-server.huggingface.co"

try:
    from datasets import load_dataset, load_dataset_builder, get_dataset_config_names
    from huggingface_hub import HfApi
    HF_AVAILABLE = True
except ImportError:
    HF_AVAILABLE = False
    logger.warning("`datasets`/`huggingface_hub` not installed — the viewer API is still used for import.")

# Ephemeral per-import progress (fine to lose on restart; it's transient UI state).
_progress: dict[str, dict[str, Any]] = {}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _hf_headers() -> dict[str, str]:
    token = os.getenv("HF_TOKEN") or os.getenv("HUGGING_FACE_HUB_TOKEN")
    return {"Authorization": f"Bearer {token}"} if token else {}


# --- dataset-viewer helpers (primary, schema-tolerant JSON) ------------------

async def _viewer_get(path: str, params: dict) -> Optional[dict]:
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.get(f"{VIEWER}/{path}", params=params, headers=_hf_headers())
        if r.status_code == 200:
            return r.json()
        logger.info(f"viewer /{path} -> {r.status_code}: {r.text[:160]}")
    except Exception as e:
        logger.info(f"viewer /{path} error: {e}")
    return None


async def _viewer_splits(dataset: str) -> list[dict[str, str]]:
    data = await _viewer_get("splits", {"dataset": dataset})
    return data.get("splits", []) if data else []


async def _resolve_config(dataset: str, split: str, subset: Optional[str]) -> Optional[str]:
    if subset:
        return subset
    splits = await _viewer_splits(dataset)
    for s in splits:
        if s.get("split") == split:
            return s.get("config")
    return splits[0].get("config") if splits else "default"


async def _viewer_rows(dataset: str, config: str, split: str, limit: int) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    offset = 0
    while len(rows) < limit:
        length = min(100, limit - len(rows))
        data = await _viewer_get("rows", {"dataset": dataset, "config": config,
                                          "split": split, "offset": offset, "length": length})
        if not data:
            break
        batch = data.get("rows", [])
        if not batch:
            break
        for item in batch:
            rows.append(item.get("row", {}))
        offset += length
        if len(batch) < length:
            break
    return rows


async def fetch_rows(dataset: str, split: str, subset: Optional[str], limit: int) -> tuple[list[dict], Optional[str]]:
    """Load up to `limit` rows as plain dicts. Viewer first, `datasets` fallback."""
    # 1) dataset-viewer API — tolerant of nested/heterogeneous schemas.
    try:
        config = await _resolve_config(dataset, split, subset)
        if config:
            rows = await _viewer_rows(dataset, config, split, limit)
            if rows:
                return rows, config
    except Exception as e:
        logger.info(f"viewer rows failed for {dataset}: {e}")

    # 2) Fallback: streaming via the datasets library.
    if HF_AVAILABLE:
        try:
            ds = load_dataset(dataset, subset, split=split, streaming=True)
            rows = [dict(x) for x in itertools.islice(ds, limit)]
            return rows, subset
        except Exception as e:
            raise HTTPException(502, _friendly_load_error(dataset, e))

    raise HTTPException(502, _friendly_load_error(dataset, None))


def _friendly_load_error(dataset: str, err: Exception | None) -> str:
    msg = str(err) if err else ""
    if "cast" in msg.lower() or "column names don't match" in msg.lower():
        return (f"'{dataset}' has an unusual/mixed row format that couldn't be read automatically "
                "(its rows don't all share the same columns). Try a specific split or subset, pick a "
                "cleaner dataset, or download it and upload a .jsonl file instead.")
    if "gated" in msg.lower() or "401" in msg or "403" in msg:
        return (f"'{dataset}' looks private or gated. Set an HF_TOKEN on the backend, or choose a public dataset.")
    return (f"Couldn't load '{dataset}'. It may be private, gated, very large, or in an unusual format. "
            "Try a different split/subset or upload a file instead.")


# --- endpoints ---------------------------------------------------------------

@router.get("/search")
async def search_datasets(query: str = "", limit: int = 12):
    if not HF_AVAILABLE:
        raise HTTPException(503, "HuggingFace Hub client not installed on the backend (`pip install huggingface-hub`).")
    try:
        api = HfApi()
        results = []
        for d in api.list_datasets(search=query or None, limit=limit, sort="downloads", direction=-1):
            results.append({
                "name": d.id,
                "description": (getattr(d, "description", "") or "").strip()[:200] or f"Dataset: {d.id}",
                "downloads": getattr(d, "downloads", 0) or 0,
                "likes": getattr(d, "likes", 0) or 0,
                "tags": (getattr(d, "tags", []) or [])[:6],
            })
        return {"datasets": results}
    except Exception as e:
        logger.error(f"HF search failed: {e}")
        raise HTTPException(502, f"HuggingFace search failed: {e}")


@router.get("/popular")
async def popular():
    """Curated, current, correctly-scoped starter datasets per training type."""
    return {
        "sl": [
            {"name": "HuggingFaceH4/no_robots", "description": "10k high-quality instruction conversations", "samples": 9500},
            {"name": "tatsu-lab/alpaca", "description": "52k instruction-following demos", "samples": 52000},
            {"name": "databricks/databricks-dolly-15k", "description": "15k human instruction/response pairs", "samples": 15000},
        ],
        "dpo": [
            {"name": "HuggingFaceH4/ultrafeedback_binarized", "description": "Binary preferences for DPO", "samples": 61135},
            {"name": "Anthropic/hh-rlhf", "description": "Helpful/harmless preference pairs", "samples": 160000},
        ],
        "rl": [
            {"name": "openai/gsm8k", "description": "Grade-school math (use subset 'main')", "samples": 8792, "subset": "main"},
            {"name": "openai/openai_humaneval", "description": "164 Python coding problems", "samples": 164},
        ],
    }


@router.get("/info/{dataset_name:path}")
async def dataset_info(dataset_name: str):
    # Prefer the viewer (robust); fall back to the datasets builder.
    splits_data = await _viewer_splits(dataset_name)
    if splits_data:
        configs = sorted({s.get("config") for s in splits_data if s.get("config")})
        config = configs[0] if configs else "default"
        splits = [s.get("split") for s in splits_data if s.get("config") == config] or ["train"]
        # Column names + nested field paths from the first rows.
        first = await _viewer_get("first-rows", {"dataset": dataset_name, "config": config, "split": splits[0]})
        features = {}
        if first:
            for f in first.get("features", []):
                features[f.get("name")] = _type_name(f.get("type"))
        sample_rows = first.get("rows", []) if first else []
        sample = sample_rows[0].get("row", {}) if sample_rows else {}
        field_paths = datautil.flatten_paths(sample) if sample else list(features.keys())
        return {"name": dataset_name, "description": f"Dataset: {dataset_name}",
                "configs": configs, "splits": splits, "features": features,
                "field_paths": field_paths, "num_rows": {}}

    if HF_AVAILABLE:
        try:
            try:
                configs = get_dataset_config_names(dataset_name)
            except Exception:
                configs = []
            config = configs[0] if configs else None
            builder = load_dataset_builder(dataset_name, config)
            features = {}
            if builder.info.features:
                for name, feat in builder.info.features.items():
                    features[name] = getattr(feat, "dtype", type(feat).__name__)
            splits, num_rows = [], {}
            if builder.info.splits:
                for sname, sinfo in builder.info.splits.items():
                    splits.append(sname)
                    num_rows[sname] = getattr(sinfo, "num_examples", 0)
            return {"name": dataset_name, "description": (builder.info.description or "")[:400] or f"Dataset: {dataset_name}",
                    "configs": configs, "splits": splits or ["train"], "features": features,
                    "field_paths": list(features.keys()), "num_rows": num_rows}
        except Exception as e:
            raise HTTPException(502, _friendly_load_error(dataset_name, e))
    raise HTTPException(502, _friendly_load_error(dataset_name, None))


def _type_name(t: Any) -> str:
    if isinstance(t, dict):
        return t.get("dtype") or t.get("_type") or "value"
    return str(t)


class PreviewRequest(BaseModel):
    dataset_name: str
    split: str = "train"
    subset: Optional[str] = None
    num_samples: int = 5


@router.post("/preview")
async def preview(req: PreviewRequest):
    rows = (await fetch_rows(req.dataset_name, req.split, req.subset, max(1, min(req.num_samples, 20))))[0]
    trimmed = [{k: (v if not isinstance(v, str) else v[:600]) for k, v in r.items()} for r in rows]
    return {"dataset_name": req.dataset_name, "rows": trimmed,
            "columns": list(rows[0].keys()) if rows else []}


class FieldMapping(BaseModel):
    source_field: str
    target_field: str  # prompt | completion | chosen | rejected | reference | messages


class ImportRequest(BaseModel):
    dataset_name: str
    split: str = "train"
    subset: Optional[str] = None
    training_type: str = "sl"                    # sl | dpo | rl
    field_mappings: list[FieldMapping] = Field(default_factory=list)
    max_samples: int = 1000
    name: Optional[str] = None


@router.post("/import")
async def import_dataset(req: ImportRequest):
    tt = (req.training_type or "sl").lower()
    import_id = f"imp_{uuid.uuid4().hex[:10]}"
    _progress[import_id] = {"status": "downloading", "progress": 10,
                            "message": f"Loading {req.dataset_name} ({req.split})…",
                            "samples_processed": 0, "total_samples": req.max_samples}

    try:
        raw_rows, _config = await fetch_rows(req.dataset_name, req.split, req.subset, max(1, req.max_samples))
        _progress[import_id].update(status="converting", progress=45, message="Converting rows…")

        # Field mappings are ADDITIVE: keep every original column AND add the
        # mapped aliases. This way a dataset whose useful data lives in an
        # unmapped column (e.g. no_robots' `messages`) still works.
        mappings = {m.source_field: m.target_field for m in req.field_mappings}
        rows: list[dict[str, Any]] = []
        for item in raw_rows:
            row = dict(item)
            for src, tgt in mappings.items():
                if not tgt:
                    continue
                # Supports nested dot-paths, e.g. "message.content" or "messages.-1.content".
                val = datautil.get_path(item, src)
                if val is not None:
                    row[tgt] = val
            rows.append(row)

        # Validate against the intended training type.
        check = datautil.validate(rows, tt if tt in ("sl", "dpo", "rl") else "sl")
        if not check["ok"]:
            _progress[import_id].update(status="error", progress=0,
                                        message="Imported data isn't compatible with this training type.")
            raise HTTPException(400, "This dataset's columns don't match " + tt.upper() + " training. "
                                     + " ".join(check["notes"]) +
                                     " Use the field-mapping step to map its columns to prompt/completion "
                                     "(or prompt/chosen/rejected for preference training).")

        _progress[import_id].update(status="saving", progress=90, message="Saving…")
        dataset_id = str(uuid.uuid4())
        fname = f"{dataset_id}_{req.dataset_name.replace('/', '_')}_{req.split}.jsonl"
        path = str(DATASETS_DIR / fname)
        with open(path, "w", encoding="utf-8") as f:
            for row in rows:
                f.write(json.dumps(row, ensure_ascii=False, default=str) + "\n")

        num = len(rows)
        rec = {
            "id": dataset_id,
            "name": req.name or f"{req.dataset_name} ({req.split})",
            "source": "huggingface",
            "training_type": tt,
            "format": "jsonl",
            "path": path,
            "num_samples": num,
            "size_bytes": os.path.getsize(path),
            "columns": check["columns"],
            "split": {"train": int(num * 0.9), "validation": num - int(num * 0.9), "test": 0},
            "schema_ok": check["ok"],
            "schema_notes": check["notes"],
            "meta": {"hf_dataset": req.dataset_name, "hf_split": req.split, "hf_subset": req.subset},
            "created_at": _now(),
        }
        dataset = db.add_dataset(rec)          # <-- register so training can find it
        _progress[import_id].update(status="complete", progress=100,
                                    message=f"Imported {num} examples", samples_processed=num, total_samples=num)
        logger.info(f"Imported {num} rows from {req.dataset_name} -> dataset {dataset_id}")
        return {"import_id": import_id, "dataset": dataset}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"HF import failed: {e}", exc_info=True)
        _progress[import_id] = {"status": "error", "progress": 0, "message": _friendly_load_error(req.dataset_name, e),
                                "samples_processed": 0, "total_samples": 0}
        raise HTTPException(502, _friendly_load_error(req.dataset_name, e))


@router.get("/import-progress/{import_id}")
async def import_progress(import_id: str):
    if import_id not in _progress:
        raise HTTPException(404, "Import id not found")
    return _progress[import_id]
