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

    A literal key wins over path traversal. Real datasets ship flat columns with
    dots in the name — the Reddit dumps use "subreddit.nsfw" — and splitting
    those would look up a nested object that was never there, quietly returning
    None for every row.
    """
    if isinstance(obj, dict) and path in obj:
        return obj[path]

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


def suggest_mapping(columns: list[str], training_type: str) -> dict[str, str]:
    """Best-guess source column for each target field of a training type.

    Uses the same alias lists the loaders use, so a suggestion that looks right
    in the UI is one the trainer will actually accept.
    """
    tt = (training_type or "sl").lower()
    targets = {
        "sl": [("prompt", PROMPT_KEYS), ("completion", COMPLETION_KEYS)],
        "dpo": [("prompt", PROMPT_KEYS), ("chosen", CHOSEN_KEYS), ("rejected", REJECTED_KEYS)],
        "rl": [("prompt", PROMPT_KEYS), ("reference", REFERENCE_KEYS)],
    }.get(tt, [("prompt", PROMPT_KEYS), ("completion", COMPLETION_KEYS)])

    lower = {c.lower(): c for c in columns}
    out: dict[str, str] = {}
    taken: set[str] = set()
    for target, aliases in targets:
        for alias in aliases:
            col = lower.get(alias)
            if col and col not in taken:
                out[target] = col
                taken.add(col)
                break
    return out


def fit_from_rows(rows: list[dict[str, Any]], prefer: Optional[str] = None) -> dict[str, Any]:
    """Which training type can these rows actually feed, and is mapping needed?

    Order matters. Almost anything with a prompt-like column satisfies RL, so
    leading with it would mislabel real DPO/SL data — hence most-specific-first.
    When the caller already has a type in mind (`prefer`), it is checked first
    so data suiting several types isn't reported under the wrong one.
    """
    order = ["dpo", "sl", "rl"]
    if prefer in order:
        order = [prefer] + [t for t in order if t != prefer]

    per_type = {}
    for tt in order:
        v = validate(rows, tt)
        per_type[tt] = {"usable": v["usable"], "total": v["total"]}

    best = next((tt for tt in order if per_type[tt]["usable"] > 0), None)
    columns = detect_columns(rows)
    also = [t for t in order if t != best and per_type[t]["usable"] > 0]

    if not best:
        return {"status": "needs_mapping", "training_type": None, "columns": columns, "also_fits": [],
                "detail": "No standard prompt/answer columns found — you'll map fields by hand.",
                "per_type": per_type}

    usable, total = per_type[best]["usable"], per_type[best]["total"]
    if usable == total:
        return {"status": "ready", "training_type": best, "columns": columns, "also_fits": also,
                "detail": "Columns already match — no field mapping needed.", "per_type": per_type}
    return {"status": "partial", "training_type": best, "columns": columns, "also_fits": also,
            "detail": f"{usable} of {total} sampled rows have the fields needed; the rest would be skipped.",
            "per_type": per_type}


# --- row filtering -----------------------------------------------------------

# Values that look like data but are really an absence of it. Real exports are
# full of these — a Reddit dump uses "[removed]" where a body used to be, and it
# passes every schema check while teaching a model to answer with nonsense.
JUNK_VALUES = {
    "", "[removed]", "[deleted]", "[removed by reddit]", "[removed by moderator]",
    "n/a", "na", "null", "none", "nan", "-", "--", "unknown", "undefined",
}

FILTER_OPS = (
    "non_empty",      # drop blanks and JUNK_VALUES
    "not_one_of",     # drop rows whose value is in `value` (list or comma string)
    "gte", "lte",     # numeric threshold
    "equals", "not_equals",
    "contains", "not_contains",
    "is_true", "is_false",
)


def _as_float(v: Any) -> Optional[float]:
    try:
        return float(str(v).strip())
    except (TypeError, ValueError):
        return None


def _as_bool(v: Any) -> Optional[bool]:
    s = str(v).strip().lower()
    if s in ("true", "1", "yes", "y", "t"):
        return True
    if s in ("false", "0", "no", "n", "f"):
        return False
    return None


def _passes(value: Any, op: str, target: Any) -> bool:
    """Does one value satisfy one rule? Unknown ops keep the row."""
    text = "" if value is None else str(value).strip()

    if op == "non_empty":
        return text.lower() not in JUNK_VALUES
    if op == "not_one_of":
        opts = target if isinstance(target, list) else str(target or "").split(",")
        return text.lower() not in {str(o).strip().lower() for o in opts}
    if op in ("gte", "lte"):
        n, t = _as_float(value), _as_float(target)
        if n is None or t is None:
            return False          # can't compare -> not a row you want
        return n >= t if op == "gte" else n <= t
    if op == "equals":
        return text.lower() == str(target).strip().lower()
    if op == "not_equals":
        return text.lower() != str(target).strip().lower()
    if op == "contains":
        return str(target).strip().lower() in text.lower()
    if op == "not_contains":
        return str(target).strip().lower() not in text.lower()
    if op in ("is_true", "is_false"):
        b = _as_bool(value)
        if b is None:
            return False
        return b if op == "is_true" else not b
    return True


def apply_filters(rows: list[dict[str, Any]],
                  rules: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Keep rows satisfying every rule. Returns (kept, stats).

    Stats report per-rule drop counts so the UI can say which rule is doing the
    work — a filter that silently removes everything is worse than none.
    """
    if not rules:
        return rows, {"before": len(rows), "after": len(rows), "dropped": 0, "by_rule": []}

    per_rule = [0] * len(rules)
    kept: list[dict[str, Any]] = []
    for row in rows:
        ok = True
        for i, rule in enumerate(rules):
            col, op = rule.get("column"), rule.get("op")
            if not col or not op:
                continue
            if not _passes(get_path(row, col), op, rule.get("value")):
                per_rule[i] += 1
                ok = False
                break          # first failing rule owns the drop
        if ok:
            kept.append(row)

    return kept, {
        "before": len(rows), "after": len(kept), "dropped": len(rows) - len(kept),
        "by_rule": [{"column": r.get("column"), "op": r.get("op"),
                     "value": r.get("value"), "dropped": per_rule[i]}
                    for i, r in enumerate(rules)],
    }


def suggest_filters(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Propose filters from what's actually in the sample.

    Only suggests a rule when the sample shows evidence it's needed, so the
    defaults aren't noise on a clean dataset.
    """
    if not rows:
        return []
    out: list[dict[str, Any]] = []
    columns = detect_columns(rows)

    for col in columns:
        values = [get_path(r, col) for r in rows]
        texts = [("" if v is None else str(v).strip()) for v in values]
        non_null = [t for t in texts if t]

        # Placeholder junk sitting where real content should be.
        junk = sum(1 for t in texts if t.lower() in JUNK_VALUES)
        if junk and junk < len(texts):
            out.append({"column": col, "op": "non_empty", "value": "",
                        "why": f"{junk} of {len(texts)} sampled rows are empty or a placeholder "
                               f"like [removed] — those would train as if they were real answers."})
            continue

        if not non_null:
            continue

        # Boolean flags worth excluding by default (NSFW and friends).
        bools = [_as_bool(t) for t in non_null]
        if all(b is not None for b in bools) and any(bools):
            if any(k in col.lower() for k in ("nsfw", "over_18", "adult", "explicit", "spam", "deleted")):
                out.append({"column": col, "op": "is_false", "value": "",
                            "why": f"{sum(1 for b in bools if b)} sampled rows are flagged {col}."})
            continue

        # A quality signal you can threshold on.
        nums = [_as_float(t) for t in non_null]
        if all(n is not None for n in nums) and len(nums) >= 5:
            if any(k in col.lower() for k in ("score", "upvote", "rating", "votes", "likes", "quality")):
                ranked = sorted(n for n in nums if n is not None)
                median = ranked[len(ranked) // 2]
                out.append({"column": col, "op": "gte", "value": max(1, int(median)),
                            "why": f"'{col}' looks like a quality signal (median {median:g} in the "
                                   f"sample). Raising it trades volume for better examples."})
    return out
