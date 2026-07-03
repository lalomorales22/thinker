"""
Model catalog — the single source of truth for which base models exist.

Replaces every hardcoded/stale model list that used to be copy-pasted across
models.py, chat.py, assistant.py and the frontend. The list is fetched live
from Tinker's machine-readable catalog (models.json) with an embedded snapshot
as an offline fallback, and each entry is enriched with the metadata the UI
needs (pricing, context window, vision/reasoning/base flags, recommended
renderer, retiring/discount notices).

Snapshot captured 2026-07-02 from
https://tinker-docs.thinkingmachines.ai/tinker/models.json
"""
from __future__ import annotations

import json
import time
from typing import Any, Optional

from config import CATALOG_CACHE_PATH, TINKER_MODELS_URL
from utils import logger

# --- Embedded offline snapshot (verbatim from the live models.json) ----------

SNAPSHOT: list[dict[str, Any]] = [
    {"name": "Nemotron-3-Ultra-550B-A55B", "tinker_id": "nvidia/NVIDIA-Nemotron-3-Ultra-550B-A55B-BF16", "type": "Hybrid", "arch": "MoE", "size": "Large", "context": "64K", "prefill": "$1.66", "sample": "$4.15", "train": "$4.98", "note": "Limited-time 50% discount"},
    {"name": "Nemotron-3-Ultra-550B-A55B (256K)", "tinker_id": "nvidia/NVIDIA-Nemotron-3-Ultra-550B-A55B-BF16:peft:262144", "type": "Hybrid", "arch": "MoE", "size": "Large", "context": "256K", "prefill": "$3.32", "sample": "$8.30", "train": "$9.96", "note": "Limited-time 50% discount"},
    {"name": "Nemotron-3-Super-120B-A12B", "tinker_id": "nvidia/NVIDIA-Nemotron-3-Super-120B-A12B-BF16", "type": "Hybrid", "arch": "MoE", "size": "Large", "context": "64K", "prefill": "$0.38", "sample": "$0.96", "train": "$1.16", "note": "Limited-time 50% discount"},
    {"name": "Nemotron-3-Super-120B-A12B (256K)", "tinker_id": "nvidia/NVIDIA-Nemotron-3-Super-120B-A12B-BF16:peft:262144", "type": "Hybrid", "arch": "MoE", "size": "Large", "context": "256K", "prefill": "$0.76", "sample": "$1.92", "train": "$2.32", "note": "Limited-time 50% discount"},
    {"name": "Nemotron-3-Nano-30B-A3B", "tinker_id": "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-BF16", "type": "Hybrid", "arch": "MoE", "size": "Medium", "context": "64K", "prefill": "$0.13", "sample": "$0.33", "train": "$0.40", "note": "Limited-time 50% discount"},
    {"name": "Kimi-K2.6", "tinker_id": "moonshotai/Kimi-K2.6", "type": "Reasoning + Vision", "arch": "MoE", "size": "Large", "context": "32K", "prefill": "$1.47", "sample": "$3.66", "train": "$4.40"},
    {"name": "Kimi-K2.6 (128K)", "tinker_id": "moonshotai/Kimi-K2.6:peft:131072", "type": "Reasoning + Vision", "arch": "MoE", "size": "Large", "context": "128K", "prefill": "$5.15", "sample": "$12.81", "train": "$15.40"},
    {"name": "Kimi-K2.5", "tinker_id": "moonshotai/Kimi-K2.5", "type": "Reasoning + Vision", "arch": "MoE", "size": "Large", "context": "32K", "prefill": "$1.47", "sample": "$3.66", "train": "$4.40", "note": "Retiring July 12"},
    {"name": "Kimi-K2.5 (128K)", "tinker_id": "moonshotai/Kimi-K2.5:peft:131072", "type": "Reasoning + Vision", "arch": "MoE", "size": "Large", "context": "128K", "prefill": "$5.15", "sample": "$12.81", "train": "$15.40", "note": "Retiring July 12"},
    {"name": "Qwen3.6-35B-A3B", "tinker_id": "Qwen/Qwen3.6-35B-A3B", "type": "Hybrid + Vision", "arch": "MoE", "size": "Medium", "context": "64K", "prefill": "$0.36", "sample": "$0.89", "train": "$1.07"},
    {"name": "Qwen3.6-27B", "tinker_id": "Qwen/Qwen3.6-27B", "type": "Hybrid + Vision", "arch": "Dense", "size": "Medium", "context": "64K", "prefill": "$1.24", "sample": "$3.73", "train": "$3.73"},
    {"name": "Qwen3.5-397B-A17B", "tinker_id": "Qwen/Qwen3.5-397B-A17B", "type": "Hybrid + Vision", "arch": "MoE", "size": "Large", "context": "64K", "prefill": "$2.00", "sample": "$5.00", "train": "$6.00"},
    {"name": "Qwen3.5-397B-A17B (256K)", "tinker_id": "Qwen/Qwen3.5-397B-A17B:peft:262144", "type": "Hybrid + Vision", "arch": "MoE", "size": "Large", "context": "256K", "prefill": "$4.00", "sample": "$10.00", "train": "$12.00"},
    {"name": "Qwen3.5-35B-A3B-Base", "tinker_id": "Qwen/Qwen3.5-35B-A3B-Base", "type": "Base", "arch": "MoE", "size": "Medium", "context": "64K", "prefill": "$0.36", "sample": "$0.89", "train": "$1.07"},
    {"name": "Qwen3.5-9B", "tinker_id": "Qwen/Qwen3.5-9B", "type": "Hybrid + Vision", "arch": "Dense", "size": "Small", "context": "64K", "prefill": "$0.44", "sample": "$1.33", "train": "$1.33"},
    {"name": "Qwen3.5-9B-Base", "tinker_id": "Qwen/Qwen3.5-9B-Base", "type": "Base", "arch": "Dense", "size": "Small", "context": "64K", "prefill": "$0.44", "sample": "$1.33", "train": "$1.33"},
    {"name": "Qwen3.5-4B", "tinker_id": "Qwen/Qwen3.5-4B", "type": "Hybrid + Vision", "arch": "Dense", "size": "Compact", "context": "64K", "prefill": "$0.22", "sample": "$0.67", "train": "$0.67"},
    {"name": "Qwen3-8B", "tinker_id": "Qwen/Qwen3-8B", "type": "Hybrid", "arch": "Dense", "size": "Small", "context": "32K", "prefill": "$0.13", "sample": "$0.40", "train": "$0.40"},
    {"name": "GPT-OSS-120B", "tinker_id": "openai/gpt-oss-120b", "type": "Reasoning", "arch": "MoE", "size": "Medium", "context": "32K", "prefill": "$0.18", "sample": "$0.44", "train": "$0.52"},
    {"name": "GPT-OSS-120B (128K)", "tinker_id": "openai/gpt-oss-120b:peft:131072", "type": "Reasoning", "arch": "MoE", "size": "Medium", "context": "128K", "prefill": "$0.63", "sample": "$1.54", "train": "$1.82"},
    {"name": "GPT-OSS-20B", "tinker_id": "openai/gpt-oss-20b", "type": "Reasoning", "arch": "MoE", "size": "Small", "context": "32K", "prefill": "$0.12", "sample": "$0.30", "train": "$0.36"},
    {"name": "DeepSeek-V3.1", "tinker_id": "deepseek-ai/DeepSeek-V3.1", "type": "Hybrid", "arch": "MoE", "size": "Large", "context": "32K", "prefill": "$1.13", "sample": "$2.81", "train": "$3.38"},
]

# Curated beginner-friendly picks (cheap, small, instruct/vision-capable, current).
RECOMMENDED_IDS = {
    "Qwen/Qwen3.5-4B",
    "Qwen/Qwen3.5-9B",
    "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-BF16",
    "openai/gpt-oss-20b",
    "Qwen/Qwen3-8B",
}
DEFAULT_MODEL = "Qwen/Qwen3.5-4B"

_CACHE_TTL = 60 * 30  # 30 min
_mem_cache: dict[str, Any] = {"ts": 0.0, "models": None, "source": None}


# --- Enrichment --------------------------------------------------------------

def _price(v: Any) -> Optional[float]:
    if not isinstance(v, str):
        return None
    try:
        return float(v.replace("$", "").strip())
    except ValueError:
        return None


def _context_tokens(ctx: str) -> int:
    ctx = (ctx or "").strip().upper()
    try:
        if ctx.endswith("K"):
            return int(float(ctx[:-1]) * 1024)
        if ctx.endswith("M"):
            return int(float(ctx[:-1]) * 1024 * 1024)
        return int(ctx)
    except ValueError:
        return 0


def renderer_for(model_id: str) -> str:
    """Best-effort static map from a base-model id to a Tinker renderer name.

    The engine prefers the cookbook's get_recommended_renderer_name() at
    runtime; this is the offline fallback and what we show in the UI.
    """
    m = (model_id or "").lower()
    if "kimi-k2.6" in m or "kimi-k26" in m:
        return "kimi_k26"
    if "kimi-k2.5" in m or "kimi-k25" in m:
        return "kimi_k25"
    if "nemotron-3-ultra" in m:
        return "nemotron3_ultra"
    if "nemotron-3" in m or "nemotron3" in m:
        return "nemotron3"
    if "gpt-oss" in m or "gpt_oss" in m:
        return "gpt_oss_medium_reasoning"
    if "deepseek-v3" in m or "deepseekv3" in m:
        return "deepseekv3"
    if "qwen3.6" in m or "qwen3.5" in m:
        return "qwen3_5"
    if "qwen3-8b" in m or "qwen3" in m:
        return "qwen3"
    return "role_colon"


def enrich(entry: dict[str, Any]) -> dict[str, Any]:
    tid = entry.get("tinker_id") or entry.get("model_name") or entry.get("id") or ""
    typ = entry.get("type", "")
    note = entry.get("note", "") or ""
    org = tid.split("/", 1)[0] if "/" in tid else ""
    return {
        "id": tid,
        "name": entry.get("name") or tid.split("/")[-1],
        "org": org,
        "type": typ,
        "arch": entry.get("arch", ""),
        "size": entry.get("size", ""),
        "context": entry.get("context", ""),
        "context_tokens": _context_tokens(entry.get("context", "")),
        "vision": "vision" in typ.lower(),
        "reasoning": "reasoning" in typ.lower(),
        "is_base": typ.strip().lower() == "base",
        "instruct": typ.strip().lower() != "base",
        "long_context": ":peft:" in tid,
        "recommended": tid in RECOMMENDED_IDS,
        "retiring": "retir" in note.lower(),
        "discount": "discount" in note.lower(),
        "note": note,
        "url": entry.get("url"),
        "price_prefill": _price(entry.get("prefill")),
        "price_sample": _price(entry.get("sample")),
        "price_train": _price(entry.get("train")),
        "renderer": renderer_for(tid),
    }


def _enrich_all(raw: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen, out = set(), []
    for e in raw:
        m = enrich(e)
        if m["id"] and m["id"] not in seen:
            seen.add(m["id"])
            out.append(m)
    return out


# --- Fetch + cache -----------------------------------------------------------

async def _fetch_live() -> Optional[list[dict[str, Any]]]:
    try:
        import httpx
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(TINKER_MODELS_URL)
            resp.raise_for_status()
            data = resp.json()
        if isinstance(data, list) and data:
            try:
                CATALOG_CACHE_PATH.write_text(json.dumps(data), encoding="utf-8")
            except OSError:
                pass
            logger.info(f"Model catalog refreshed live: {len(data)} models")
            return data
    except Exception as e:  # network/parse errors are non-fatal
        logger.warning(f"Live model catalog fetch failed ({e}); using cache/snapshot")
    return None


def _load_cache() -> Optional[list[dict[str, Any]]]:
    try:
        if CATALOG_CACHE_PATH.exists():
            return json.loads(CATALOG_CACHE_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        pass
    return None


async def get_catalog(refresh: bool = False) -> dict[str, Any]:
    """Return {models: [...enriched...], source: str}. Cached in-memory 30 min."""
    now = time.time()
    if not refresh and _mem_cache["models"] and (now - _mem_cache["ts"] < _CACHE_TTL):
        return {"models": _mem_cache["models"], "source": _mem_cache["source"]}

    raw = await _fetch_live()
    source = "live"
    if raw is None:
        raw = _load_cache()
        source = "cache"
    if raw is None:
        raw = SNAPSHOT
        source = "snapshot"

    models = _enrich_all(raw)
    _mem_cache.update(ts=now, models=models, source=source)
    return {"models": models, "source": source}


async def get_model(model_id: str) -> Optional[dict[str, Any]]:
    cat = await get_catalog()
    return next((m for m in cat["models"] if m["id"] == model_id), None)


def snapshot_models() -> list[dict[str, Any]]:
    """Synchronous enriched snapshot (no network) — for defaults/fallbacks."""
    return _enrich_all(SNAPSHOT)
