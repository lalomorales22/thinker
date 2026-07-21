"""
Export a trained model for on-device use (MLX / Apple Silicon).

Tinker keeps your fine-tune as a LoRA adapter in its own storage and samples it
for you over the API. To run it on a phone you need the opposite: a single set
of merged weights, quantized small enough to fit in an app's memory budget.

The pipeline is three steps, all from tinker_cookbook plus mlx-lm:

    weights.download()      pull the adapter out of Tinker
    weights.build_hf_model()  merge it into the base model
    mlx_lm.convert -q       quantize and convert to MLX

The most useful part of this module is the part that runs BEFORE any of that.
Merging a 4B model means an 8 GB download and roughly 9 GB of RAM; a 20B model
means 42 GB and far more. Discovering that an hour in is miserable, so
/preflight answers both questions up front: will the result fit on a phone, and
can this machine actually perform the conversion.
"""
from __future__ import annotations

import asyncio
import importlib.util
import os
import re
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import db
from config import DATA_DIR
from events import hub
from utils import logger

router = APIRouter()

EXPORT_DIR = Path(DATA_DIR) / "exports"
EXPORT_DIR.mkdir(parents=True, exist_ok=True)

_jobs: dict[str, dict[str, Any]] = {}

# Roughly how much memory an iOS app can actually address. iOS reserves a large
# share of physical RAM for the system; these are the practical ceilings people
# hit in practice, with the extended-memory entitlement assumed on 8 GB+.
IPHONE_TIERS = [
    {"label": "iPhone 13/14 · 6 GB", "device_gb": 6, "budget_gb": 2.8},
    {"label": "iPhone 15/16 · 8 GB", "device_gb": 8, "budget_gb": 4.3},
    {"label": "iPhone 17 Pro · 12 GB", "device_gb": 12, "budget_gb": 6.5},
]

BYTES_PER_PARAM = {4: 0.5, 6: 0.75, 8: 1.0, 16: 2.0}
# Quantized weights aren't the whole story — embeddings often stay higher
# precision and the runtime needs headroom for the KV cache.
OVERHEAD = 1.10


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _params_b(model_id: str, name: str = "") -> Optional[float]:
    """Parameter count in billions, read off the model name.

    For MoE ids like `Nemotron-3-Nano-30B-A3B` the first number is total
    parameters and `A3B` is the active subset. Memory is governed by the total,
    because every expert has to be resident — so the first number is the one
    that matters here.
    """
    for text in (name, model_id):
        if not text:
            continue
        m = re.search(r"(\d+(?:\.\d+)?)\s*B\b", text, re.I)
        if m:
            try:
                return float(m.group(1))
            except ValueError:
                pass
    return None


def _machine() -> dict[str, Any]:
    try:
        ram = os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_PHYS_PAGES") / 1e9
    except (ValueError, OSError):
        ram = 0.0
    free = shutil.disk_usage(str(EXPORT_DIR)).free / 1e9
    import platform
    return {
        "arch": platform.machine(),
        "apple_silicon": platform.machine() == "arm64" and platform.system() == "Darwin",
        "ram_gb": round(ram, 1),
        "free_disk_gb": round(free, 1),
        "mlx_installed": importlib.util.find_spec("mlx_lm") is not None,
    }


@router.get("/preflight")
async def preflight(model_id: str):
    """Will it fit on a phone, and can this Mac do the conversion?"""
    model = db.get_model(model_id)
    if not model:
        raise HTTPException(404, "No such trained model.")

    base = model.get("base_model") or ""
    params = _params_b(base)
    machine = _machine()

    sizes = []
    if params:
        for bits, bpp in sorted(BYTES_PER_PARAM.items()):
            gb = params * bpp * OVERHEAD
            fits = [t["label"] for t in IPHONE_TIERS if gb <= t["budget_gb"]]
            sizes.append({
                "bits": bits,
                "size_gb": round(gb, 1),
                "fits_tiers": fits,
                "fits_any": bool(fits),
            })

    # The merge loads the full base model in bf16, which is the real ceiling.
    base_download_gb = round(params * 2.0, 1) if params else None
    merge_ram_gb = round(params * 2.0 * 1.15, 1) if params else None
    # Base download + merged bf16 copy + quantized output, with slack.
    disk_needed_gb = round(params * 2.0 * 2.3, 1) if params else None

    checks = []
    if params is None:
        checks.append({"ok": False, "label": "Model size",
                       "detail": f"Couldn't work out the parameter count from '{base}'."})
    else:
        checks.append({
            "ok": machine["free_disk_gb"] >= (disk_needed_gb or 0),
            "label": "Disk space",
            "detail": f"needs ~{disk_needed_gb} GB, you have {machine['free_disk_gb']} GB free",
        })
        checks.append({
            "ok": machine["ram_gb"] >= (merge_ram_gb or 0),
            "label": "RAM to merge",
            "detail": (f"needs ~{merge_ram_gb} GB, this machine has {machine['ram_gb']} GB"
                       + ("" if machine["ram_gb"] >= (merge_ram_gb or 0)
                          else " — it will swap heavily and may take far longer")),
        })
    checks.append({
        "ok": machine["apple_silicon"],
        "label": "Apple Silicon",
        "detail": f"MLX needs an M-series Mac (found {machine['arch']})",
    })
    checks.append({
        "ok": machine["mlx_installed"],
        "label": "mlx-lm installed",
        "detail": "installed" if machine["mlx_installed"] else "will be installed on first export",
    })

    blocking = [c for c in checks if not c["ok"]
                and c["label"] in ("Disk space", "Apple Silicon", "Model size")]
    return {
        "model": {"id": model["id"], "base_model": base, "params_b": params},
        "machine": machine,
        "sizes": sizes,
        "requirements": {"base_download_gb": base_download_gb,
                         "merge_ram_gb": merge_ram_gb, "disk_needed_gb": disk_needed_gb},
        "checks": checks,
        "can_run": not blocking,
        "blockers": [c["label"] for c in blocking],
    }


class ExportRequest(BaseModel):
    model_id: str
    bits: int = 4


def _publish(job_id: str, **patch) -> None:
    job = _jobs.setdefault(job_id, {})
    job.update(patch)
    hub.publish({"type": "export_progress", "data": {"job_id": job_id, **job}})


async def _run_step(job_id: str, label: str, cmd: list[str]) -> None:
    """Run a subprocess, streaming its output as progress."""
    _publish(job_id, step=label, message=f"{label}…")
    proc = await asyncio.create_subprocess_exec(
        *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT)
    assert proc.stdout
    tail: list[str] = []
    async for raw in proc.stdout:
        line = raw.decode(errors="replace").strip()
        if not line:
            continue
        tail = (tail + [line])[-40:]
        _publish(job_id, message=line[:200])
    rc = await proc.wait()
    if rc != 0:
        raise RuntimeError(f"{label} failed (exit {rc}):\n" + "\n".join(tail[-12:]))


async def _export(job_id: str, model: dict, bits: int) -> None:
    out_root = EXPORT_DIR / f"{model['id']}_{bits}bit"
    adapter_dir = out_root / "adapter"
    merged_dir = out_root / "merged"
    mlx_dir = out_root / "mlx"
    base = model.get("base_model") or ""
    tinker_path = model.get("sampler_path") or model.get("tinker_path") or ""

    try:
        if not tinker_path:
            raise RuntimeError("This model has no Tinker checkpoint path recorded, so there's "
                               "nothing to download. It may have been a demo-mode run.")
        out_root.mkdir(parents=True, exist_ok=True)

        if importlib.util.find_spec("mlx_lm") is None:
            await _run_step(job_id, "Installing mlx-lm",
                            ["python", "-m", "pip", "install", "-q", "mlx-lm"])

        _publish(job_id, step="Downloading adapter", progress=10,
                 message=f"Pulling {tinker_path} out of Tinker…")
        from tinker_cookbook.weights import download, build_hf_model
        await asyncio.to_thread(download, tinker_path=tinker_path, output_dir=str(adapter_dir))

        _publish(job_id, step="Merging into base model", progress=40,
                 message=f"Merging the adapter into {base} — the memory-hungry step.")
        await asyncio.to_thread(
            build_hf_model, base_model=base, adapter_path=str(adapter_dir),
            output_path=str(merged_dir), dtype="bfloat16")

        _publish(job_id, step="Quantizing to MLX", progress=75)
        await _run_step(job_id, f"Quantizing to {bits}-bit MLX", [
            "python", "-m", "mlx_lm", "convert", "--hf-path", str(merged_dir),
            "-q", "--q-bits", str(bits), "--mlx-path", str(mlx_dir)])

        size = sum(f.stat().st_size for f in mlx_dir.rglob("*") if f.is_file()) / 1e9
        _publish(job_id, step="Done", progress=100, status="complete",
                 output_path=str(mlx_dir), size_gb=round(size, 2),
                 message=f"Exported to {mlx_dir} ({size:.2f} GB)")
        logger.info(f"Export {model['id']} -> {mlx_dir} ({size:.2f} GB)")
    except Exception as e:
        logger.error(f"Export failed for {model.get('id')}: {e}", exc_info=True)
        _publish(job_id, status="failed", progress=0, error=str(e),
                 message=f"Export failed: {e}")


@router.post("/start")
async def start_export(req: ExportRequest):
    model = db.get_model(req.model_id)
    if not model:
        raise HTTPException(404, "No such trained model.")
    if req.bits not in BYTES_PER_PARAM:
        raise HTTPException(400, f"Unsupported bit width {req.bits}.")

    job_id = f"exp_{uuid.uuid4().hex[:10]}"
    _jobs[job_id] = {"job_id": job_id, "model_id": req.model_id, "bits": req.bits,
                     "status": "running", "progress": 0, "step": "Starting",
                     "created_at": _now()}
    asyncio.create_task(_export(job_id, model, req.bits))
    return {"job_id": job_id, "job": _jobs[job_id]}


@router.get("/jobs/{job_id}")
async def export_job(job_id: str):
    job = _jobs.get(job_id)
    if not job:
        raise HTTPException(404, "No such export job.")
    return job
