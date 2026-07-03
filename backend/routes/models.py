"""
Model routes — live base-model catalog + your trained models.

The base-model list now comes from the single source of truth (catalog.py, fed
by Tinker's live models.json), not a hardcoded/stale array. Trained models come
from the DB (real outputs of training jobs), not a fake seed row.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Header, HTTPException

import catalog
import db
from config import get_tinker_api_key

router = APIRouter()


@router.get("/catalog")
async def model_catalog(refresh: bool = False):
    """Full enriched base-model catalog with pricing/context/vision/flags."""
    cat = await catalog.get_catalog(refresh=refresh)
    return {
        "models": cat["models"],
        "source": cat["source"],
        "recommended_default": catalog.DEFAULT_MODEL,
        "recommended": [m["id"] for m in cat["models"] if m["recommended"]],
    }


@router.get("/base/available")
async def base_models(x_api_key: Optional[str] = Header(None)):
    """Back-compat: flat list of usable base-model ids (excludes retired)."""
    cat = await catalog.get_catalog()
    ids = [m["id"] for m in cat["models"] if not m["retiring"]]
    return {"models": ids, "source": cat["source"]}


@router.get("/")
async def list_models():
    """Models you have actually trained (persisted)."""
    return {"models": db.list_models()}


@router.get("/{model_name}")
async def get_model(model_name: str):
    m = db.get_model(model_name)
    if not m:
        raise HTTPException(404, "Model not found")
    return m


@router.delete("/{model_name}")
async def delete_model(model_name: str):
    if not db.get_model(model_name):
        raise HTTPException(404, "Model not found")
    db.delete_model(model_name)
    return {"message": f"Model {model_name} deleted"}
