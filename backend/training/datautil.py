"""
Dataset loading, normalization, and schema validation.

The old code silently mangled data (splitting plain text in half, joining
message lists into one blob) and then let training "succeed" on garbage. This
module instead understands the common dataset shapes, converts them into the
canonical schema each training type needs, and reports honest, human-readable
problems so the UI can tell the user exactly what to fix.

Canonical schemas the trainer consumes:
  - Supervised (sl):  {"messages": [{"role","content"}, ...]}   (last assistant
                       message is the target) — also accepts prompt/completion.
  - Preference (dpo): {"prompt", "chosen", "rejected"}
  - Reinforcement(rl):{"prompt", "reference"?}                  (reference optional)
"""
from __future__ import annotations

import csv
import json
from typing import Any, Optional

# Common column aliases seen across HF / uploaded datasets.
PROMPT_KEYS = ["prompt", "question", "instruction", "input", "query", "context", "problem"]
COMPLETION_KEYS = ["completion", "answer", "output", "response", "target", "solution"]
CHOSEN_KEYS = ["chosen", "preferred", "winner", "positive", "response_a", "chosen_response"]
REJECTED_KEYS = ["rejected", "loser", "not_preferred", "negative", "response_b", "rejected_response"]
MESSAGES_KEYS = ["messages", "conversations", "conversation", "chat", "dialogue"]
REFERENCE_KEYS = COMPLETION_KEYS + ["reference", "gold", "label"]


def load_rows(path: str, fmt: str, limit: Optional[int] = None) -> list[dict[str, Any]]:
    """Load a dataset file into a list of dict rows."""
    fmt = (fmt or "").lower()
    rows: list[dict[str, Any]] = []
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        if fmt == "jsonl":
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    obj = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if isinstance(obj, dict):
                    rows.append(obj)
                if limit and len(rows) >= limit:
                    break
        elif fmt == "json":
            data = json.load(f)
            if isinstance(data, dict):
                # {"data": [...]} or a single record
                data = data.get("data") if isinstance(data.get("data"), list) else [data]
            for obj in data or []:
                if isinstance(obj, dict):
                    rows.append(obj)
                if limit and len(rows) >= limit:
                    break
        elif fmt == "csv":
            reader = csv.DictReader(f)
            for obj in reader:
                rows.append(dict(obj))
                if limit and len(rows) >= limit:
                    break
        else:
            raise ValueError(f"Unsupported dataset format: {fmt}")
    return rows


def _first_key(row: dict[str, Any], keys: list[str]) -> Optional[str]:
    lower = {k.lower(): k for k in row.keys()}
    for k in keys:
        if k in lower:
            return lower[k]
    return None


def _text_of(value: Any) -> str:
    """Coerce a value (string, message list, or content-part list) into text."""
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        dicts = [p for p in value if isinstance(p, dict)]
        if dicts:
            # Content-part list [{type, text, ...}] -> join the text of the parts.
            if all(("text" in p) and not any(k in p for k in ("content", "value", "role")) for p in dicts):
                parts = [str(p.get("text", "")) for p in dicts if p.get("text")]
                if parts:
                    return " ".join(parts)
            # Message list [{role, content}, ...] -> last non-empty content.
            for msg in reversed(value):
                if isinstance(msg, dict):
                    content = msg.get("content") or msg.get("value") or msg.get("text")
                    if content:
                        return _text_of(content)
        parts = [p.get("text", "") for p in value if isinstance(p, dict) and p.get("type") == "text"]
        if parts:
            return " ".join(parts)
        return " ".join(str(v) for v in value)
    if isinstance(value, dict):
        return str(value.get("content") or value.get("text") or value.get("value") or value)
    return str(value)


def get_path(obj: Any, path: str) -> Any:
    """Resolve a dot-path against a nested row.

    Supports dict keys, integer list indices (negatives allowed), and — when a
    non-integer segment lands on a list of dicts — collecting that key from each
    item (e.g. "messages.content" -> [content, content, ...]). Returns None when
    the path can't be resolved.
    """
    cur = obj
    for seg in str(path).split("."):
        if cur is None:
            return None
        if isinstance(cur, list):
            try:
                cur = cur[int(seg)]
            except (ValueError, TypeError):
                collected = [get_path(it, seg) for it in cur if isinstance(it, dict)]
                collected = [c for c in collected if c is not None]
                cur = collected or None
            except IndexError:
                return None
        elif isinstance(cur, dict):
            cur = cur.get(seg)
        else:
            return None
    return cur


def flatten_paths(row: dict[str, Any], max_depth: int = 4) -> list[str]:
    """List selectable dot-paths for a row, including nested struct/list fields.

    e.g. {"prompt": "...", "message": {"role": "...", "content": [{"text": "..."}]}}
    -> ["prompt", "message", "message.role", "message.content", "message.content.text"]
    """
    out: list[str] = []

    def walk(obj: Any, prefix: str, depth: int) -> None:
        if depth > max_depth:
            return
        if isinstance(obj, dict):
            for k, v in obj.items():
                p = f"{prefix}.{k}" if prefix else str(k)
                out.append(p)
                walk(v, p, depth + 1)
        elif isinstance(obj, list) and obj:
            first = obj[0]
            if isinstance(first, dict):
                walk(first, prefix, depth + 1)  # collection semantics under the list path

    walk(row, "", 0)
    seen, res = set(), []
    for p in out:
        if p not in seen:
            seen.add(p)
            res.append(p)
    return res


def to_messages(row: dict[str, Any]) -> Optional[list[dict[str, str]]]:
    """Extract a supervised conversation (list of role/content messages).

    Returns None when the row can't be interpreted as a chat/completion example.
    """
    # 1) Explicit message list.
    mk = _first_key(row, MESSAGES_KEYS)
    if mk and isinstance(row[mk], list) and row[mk]:
        out: list[dict[str, str]] = []
        for m in row[mk]:
            if not isinstance(m, dict):
                continue
            role = (m.get("role") or m.get("from") or "user").lower()
            role = {"human": "user", "gpt": "assistant", "bot": "assistant", "ai": "assistant"}.get(role, role)
            content = _text_of(m.get("content") if "content" in m else m.get("value") or m.get("text"))
            if content:
                out.append({"role": role, "content": content})
        # Need at least one assistant turn to have a training target.
        if any(m["role"] == "assistant" for m in out):
            return out
        return None

    # 2) prompt/completion style pairs.
    pk = _first_key(row, PROMPT_KEYS)
    ck = _first_key(row, COMPLETION_KEYS)
    if pk and ck:
        prompt = _text_of(row[pk])
        completion = _text_of(row[ck])
        # instruction + input -> combine
        ik = _first_key(row, ["input", "context"])
        if pk.lower() in ("instruction",) and ik and ik != pk and row.get(ik):
            prompt = f"{prompt}\n\n{_text_of(row[ik])}".strip()
        if prompt and completion:
            return [{"role": "user", "content": prompt}, {"role": "assistant", "content": completion}]
    return None


def to_preference(row: dict[str, Any]) -> Optional[dict[str, str]]:
    pk = _first_key(row, PROMPT_KEYS)
    chk = _first_key(row, CHOSEN_KEYS)
    rjk = _first_key(row, REJECTED_KEYS)
    if pk and chk and rjk:
        prompt, chosen, rejected = _text_of(row[pk]), _text_of(row[chk]), _text_of(row[rjk])
        if prompt and chosen and rejected:
            return {"prompt": prompt, "chosen": chosen, "rejected": rejected}
    return None


def to_rl(row: dict[str, Any]) -> Optional[dict[str, str]]:
    pk = _first_key(row, PROMPT_KEYS)
    if not pk:
        return None
    prompt = _text_of(row[pk])
    if not prompt:
        return None
    rk = _first_key(row, REFERENCE_KEYS)
    reference = _text_of(row[rk]) if rk else ""
    return {"prompt": prompt, "reference": reference}


def detect_columns(rows: list[dict[str, Any]]) -> list[str]:
    cols: list[str] = []
    for r in rows[:50]:
        for k in r.keys():
            if k not in cols:
                cols.append(k)
    return cols


def validate(rows: list[dict[str, Any]], training_type: str) -> dict[str, Any]:
    """Validate that `rows` can produce trainable examples for `training_type`.

    Returns {ok, usable, total, notes[], columns[]}.
    """
    tt = (training_type or "sl").lower()
    total = len(rows)
    columns = detect_columns(rows)
    notes: list[str] = []

    if total == 0:
        return {"ok": False, "usable": 0, "total": 0,
                "notes": ["The dataset is empty (no rows found)."], "columns": columns}

    if tt == "dpo":
        usable = sum(1 for r in rows if to_preference(r) is not None)
        if usable == 0:
            notes.append(
                "Preference (DPO) training needs a 'prompt', a 'chosen' answer, and a "
                "'rejected' answer in every row. None of your rows have all three. "
                f"Detected columns: {', '.join(columns) or 'none'}."
            )
    elif tt == "rl":
        usable = sum(1 for r in rows if to_rl(r) is not None)
        if usable == 0:
            notes.append(
                "Reinforcement (RL) training needs a 'prompt' the model can respond to "
                "(a 'reference'/answer column is optional but improves the reward). "
                f"Detected columns: {', '.join(columns) or 'none'}."
            )
    else:  # sl
        usable = sum(1 for r in rows if to_messages(r) is not None)
        if usable == 0:
            notes.append(
                "Supervised training needs either a 'messages' chat list, or a "
                "'prompt'+'completion' pair (aliases like input/output, "
                "instruction/response, question/answer also work) in each row. "
                f"Detected columns: {', '.join(columns) or 'none'}."
            )

    if 0 < usable < total:
        notes.append(f"{total - usable} of {total} rows are missing required fields and will be skipped.")

    return {"ok": usable > 0, "usable": usable, "total": total, "notes": notes, "columns": columns}


def iter_examples(rows: list[dict[str, Any]], training_type: str):
    """Yield canonical trainable examples for the given training type."""
    tt = (training_type or "sl").lower()
    for r in rows:
        if tt == "dpo":
            ex = to_preference(r)
        elif tt == "rl":
            ex = to_rl(r)
        else:
            ex = to_messages(r)
        if ex is not None:
            yield ex
