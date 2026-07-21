"""
Voice seeds — hand-write a character, then expand it with a local teacher model.

No dataset on HuggingFace is *your* character. The only way a fine-tune sounds
like a specific person is if someone writes that voice down first, so this is
the part of the pipeline that can't be automated: you author a small number of
exchanges that genuinely sound right, and a teacher model fans them out into
enough examples to train on.

Expansion runs against local Ollama, so generating a few thousand examples costs
nothing and nothing leaves the machine. Generated candidates are held for review
rather than saved — a teacher drifts, and unreviewed drift is exactly how a
character turns into a generic assistant with a funny name.

Seeds live in a JSON file rather than the database: there are only ever a few
hundred, they're hand-authored, and keeping them as plain text means they can be
edited, diffed, and backed up outside the app.
"""
from __future__ import annotations

import json
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

import db
from config import DATA_DIR, DATASETS_DIR, OLLAMA_MODEL, OLLAMA_URL
from training import datautil
from utils import logger

router = APIRouter()

SEEDS_PATH = Path(DATA_DIR) / "voice_seeds.json"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _load() -> dict[str, Any]:
    if SEEDS_PATH.exists():
        try:
            return json.loads(SEEDS_PATH.read_text(encoding="utf-8"))
        except Exception as e:
            logger.warning(f"voice_seeds.json unreadable ({e}); starting fresh")
    return {"name": "Randal", "description": "", "seeds": []}


def _save(data: dict[str, Any]) -> None:
    SEEDS_PATH.parent.mkdir(parents=True, exist_ok=True)
    SEEDS_PATH.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


class Turn(BaseModel):
    role: str          # user | assistant
    content: str


class Seed(BaseModel):
    id: Optional[str] = None
    turns: list[Turn] = Field(default_factory=list)
    note: str = ""
    origin: str = "hand"   # hand | expanded


class Persona(BaseModel):
    name: str = "Randal"
    description: str = ""


@router.get("")
async def get_all():
    """The character sheet plus every seed written so far."""
    data = _load()
    hand = sum(1 for s in data["seeds"] if s.get("origin", "hand") == "hand")
    return {**data, "counts": {"total": len(data["seeds"]), "hand": hand,
                               "expanded": len(data["seeds"]) - hand}}


@router.put("/persona")
async def set_persona(p: Persona):
    data = _load()
    data["name"], data["description"] = p.name, p.description
    _save(data)
    return {"name": data["name"], "description": data["description"]}


@router.post("/seed")
async def upsert_seed(seed: Seed):
    """Create or replace one exchange."""
    turns = [t for t in seed.turns if t.content.strip()]
    if len(turns) < 2:
        raise HTTPException(400, "A seed needs at least one message and one reply.")
    data = _load()
    payload = {"id": seed.id or f"sd_{uuid.uuid4().hex[:10]}",
               "turns": [t.dict() for t in turns], "note": seed.note,
               "origin": seed.origin or "hand", "created_at": _now()}
    for i, existing in enumerate(data["seeds"]):
        if existing["id"] == payload["id"]:
            data["seeds"][i] = {**existing, **payload}
            break
    else:
        data["seeds"].append(payload)
    _save(data)
    return payload


@router.delete("/seed/{seed_id}")
async def delete_seed(seed_id: str):
    data = _load()
    before = len(data["seeds"])
    data["seeds"] = [s for s in data["seeds"] if s["id"] != seed_id]
    _save(data)
    return {"deleted": before - len(data["seeds"])}


# --- expansion ---------------------------------------------------------------

EXPAND_SYSTEM = """You write training data for a character. You will be shown a character brief and several example exchanges that define exactly how they speak.

Write NEW exchanges in that same voice. Rules:
- Match the character's rhythm, length and register. If their replies are short, yours must be short. Do not make them more articulate, more formal, or more helpful than the examples show.
- Cover DIFFERENT situations from the examples. Vary the emotional temperature — some light, some heavy, some mundane.
- The person talking to them is a real human with real problems. Do not write the human as a prompt-engineer or as someone testing the character.
- Never mention that this is training data, an AI, or a model.

Return ONLY a JSON array. Each item is an array of turns:
[
  [{"role":"user","content":"..."},{"role":"assistant","content":"..."}],
  [{"role":"user","content":"..."},{"role":"assistant","content":"..."},{"role":"user","content":"..."},{"role":"assistant","content":"..."}]
]
No prose, no code fences, no commentary — just the JSON array."""


class ExpandRequest(BaseModel):
    count: int = 8
    model: Optional[str] = None
    topic_hint: str = ""
    temperature: float = 0.9


def _parse_conversations(text: str) -> list[list[dict[str, str]]]:
    """Pull conversations out of a teacher's reply, tolerating stray prose.

    Local models wrap JSON in fences and add commentary no matter how firmly
    you ask them not to, so this finds the outermost array rather than trusting
    the whole response to parse.
    """
    cleaned = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.M).strip()
    candidates = [cleaned]
    start, end = cleaned.find("["), cleaned.rfind("]")
    if start != -1 and end > start:
        candidates.append(cleaned[start:end + 1])

    for c in candidates:
        try:
            parsed = json.loads(c)
        except Exception:
            continue
        if not isinstance(parsed, list):
            continue
        out = []
        for conv in parsed:
            if isinstance(conv, dict) and "turns" in conv:
                conv = conv["turns"]
            if not isinstance(conv, list):
                continue
            turns = [
                {"role": ("assistant" if str(t.get("role", "")).lower() in ("assistant", "randal", "bot")
                          else "user"),
                 "content": str(t.get("content") or t.get("value") or "").strip()}
                for t in conv if isinstance(t, dict)
            ]
            turns = [t for t in turns if t["content"]]
            # Needs at least one exchange, and must end on the character.
            if len(turns) >= 2 and turns[-1]["role"] == "assistant":
                out.append(turns)
        if out:
            return out
    return []


@router.post("/expand")
async def expand(req: ExpandRequest):
    """Generate candidate exchanges from the seeds. Nothing is saved."""
    data = _load()
    seeds = data["seeds"]
    if len(seeds) < 3:
        raise HTTPException(
            400,
            f"Write at least 3 seeds first — there are {len(seeds)}. The teacher copies "
            "what it's shown, so a thin brief produces a generic voice.",
        )

    examples = "\n\n".join(
        "\n".join(f"{t['role'].upper()}: {t['content']}" for t in s["turns"])
        for s in seeds[:12]
    )
    brief = (f"CHARACTER: {data.get('name') or 'the character'}\n"
             f"{data.get('description') or ''}\n\n"
             f"EXAMPLE EXCHANGES:\n{examples}")
    ask = f"Write {req.count} new exchanges."
    if req.topic_hint.strip():
        ask += f" Focus on situations involving: {req.topic_hint.strip()}."

    model = req.model or OLLAMA_MODEL
    try:
        async with httpx.AsyncClient(timeout=300.0) as client:
            resp = await client.post(f"{OLLAMA_URL}/api/chat", json={
                "model": model,
                "messages": [{"role": "system", "content": EXPAND_SYSTEM},
                             {"role": "user", "content": f"{brief}\n\n{ask}"}],
                "stream": False,
                "options": {"temperature": req.temperature},
            })
            resp.raise_for_status()
            text = resp.json().get("message", {}).get("content", "")
    except Exception as e:
        raise HTTPException(
            502,
            f"Couldn't reach Ollama at {OLLAMA_URL} ({e}). Start it with `ollama serve`, "
            f"and make sure '{model}' is pulled.",
        )

    convs = _parse_conversations(text)
    if not convs:
        raise HTTPException(
            502,
            f"'{model}' didn't return usable JSON. Smaller models often can't hold the "
            "format — try a larger one, or lower the count.",
        )
    return {"candidates": [{"turns": c} for c in convs], "model": model,
            "asked_for": req.count, "got": len(convs)}


class AcceptRequest(BaseModel):
    candidates: list[Seed] = Field(default_factory=list)


@router.post("/accept")
async def accept(req: AcceptRequest):
    """Keep reviewed candidates as seeds."""
    data = _load()
    added = 0
    for c in req.candidates:
        turns = [t.dict() for t in c.turns if t.content.strip()]
        if len(turns) < 2:
            continue
        data["seeds"].append({"id": f"sd_{uuid.uuid4().hex[:10]}", "turns": turns,
                              "note": c.note, "origin": "expanded", "created_at": _now()})
        added += 1
    _save(data)
    return {"added": added, "total": len(data["seeds"])}


class ToDatasetRequest(BaseModel):
    name: str = ""
    include_expanded: bool = True


@router.post("/to-dataset")
async def to_dataset(req: ToDatasetRequest):
    """Turn the seeds into a normal, trainable Thinker dataset."""
    data = _load()
    seeds = [s for s in data["seeds"]
             if req.include_expanded or s.get("origin", "hand") == "hand"]
    if not seeds:
        raise HTTPException(400, "There are no seeds to turn into a dataset yet.")

    # The supervised loader trains on the final assistant turn, so emitting the
    # chat list directly keeps multi-turn context intact.
    rows = [{"messages": s["turns"]} for s in seeds]
    check = datautil.validate(rows, "sl")
    if not check["ok"]:
        raise HTTPException(400, "These seeds didn't convert cleanly. " + " ".join(check["notes"]))

    dataset_id = str(uuid.uuid4())
    path = str(DATASETS_DIR / f"{dataset_id}_voice.jsonl")
    with open(path, "w", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")

    num = len(rows)
    rec = {
        "id": dataset_id, "name": req.name.strip() or f"{data.get('name', 'Voice')} seeds",
        "source": "seeds", "training_type": "sl", "format": "jsonl", "path": path,
        "num_samples": num, "size_bytes": Path(path).stat().st_size,
        "columns": check["columns"],
        "split": {"train": int(num * 0.9), "validation": num - int(num * 0.9), "test": 0},
        "schema_ok": check["ok"], "schema_notes": check["notes"],
        "meta": {"persona": data.get("name"), "hand_written": sum(
            1 for s in seeds if s.get("origin", "hand") == "hand")},
        "created_at": _now(),
    }
    dataset = db.add_dataset(rec)
    logger.info(f"Voice seeds -> dataset '{rec['name']}' ({num} rows)")
    return {"dataset": dataset}
