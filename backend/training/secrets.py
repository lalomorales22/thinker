"""
Credential scanning for data on its way into training.

Training data leaves the machine — it is uploaded to Tinker's cloud to run a
job, and whatever the model memorises can resurface in its output later. Real
exports (chat logs, support tickets, scraped notebooks) routinely carry API
keys and passwords that nobody remembers pasting. This module flags them
BEFORE anything is stored, so the choice is explicit rather than accidental.

Detection is deliberately biased toward precision: a scanner that cries wolf
gets ignored, which is worse than not having one. Patterns are anchored on
issuer-specific prefixes wherever possible, and the generic assignment rule
requires a plausible-length value.
"""
from __future__ import annotations

import re
from typing import Any

# (label, compiled pattern). Ordered most-specific first so the generic
# assignment rule doesn't claim a hit a precise pattern would describe better.
PATTERNS: list[tuple[str, re.Pattern]] = [
    ("Anthropic API key", re.compile(r"sk-ant-[A-Za-z0-9\-_]{20,}")),
    ("OpenAI API key", re.compile(r"sk-(?:proj-)?[A-Za-z0-9\-_]{32,}")),
    ("AWS access key ID", re.compile(r"\bAKIA[0-9A-Z]{16}\b")),
    ("GitHub token", re.compile(r"\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}\b|\bgithub_pat_[A-Za-z0-9_]{22,}")),
    ("Google API key", re.compile(r"\bAIza[0-9A-Za-z\-_]{35}\b")),
    ("Slack token", re.compile(r"\bxox[baprs]-[0-9A-Za-z\-]{10,}")),
    ("HuggingFace token", re.compile(r"\bhf_[A-Za-z0-9]{30,}\b")),
    ("Stripe key", re.compile(r"\b[rs]k_(?:live|test)_[A-Za-z0-9]{20,}\b")),
    ("Private key block", re.compile(r"-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----")),
    ("JSON Web Token", re.compile(r"\beyJ[A-Za-z0-9_\-]{8,}\.eyJ[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}")),
    ("Bearer token", re.compile(r"(?i)\bbearer\s+[A-Za-z0-9\-._~+/]{20,}")),
    ("Connection string with password",
     re.compile(r"(?i)\b(?:postgres|postgresql|mysql|mongodb(?:\+srv)?|redis|amqp)://[^\s:@/]+:[^\s:@/]+@")),
    # Generic "key = value". Requires a quote or whitespace boundary and a
    # value long enough to be a real credential, to avoid matching prose like
    # "your password is wrong" or "set the api key in settings".
    ("Password or secret assignment",
     re.compile(r"(?i)\b(?:api[_\-\s]?key|secret[_\-\s]?key|access[_\-\s]?token|auth[_\-\s]?token|"
                r"client[_\-\s]?secret|password|passwd)\b\s*[:=]\s*[\"']?([A-Za-z0-9\-_./+=]{12,})[\"']?")),
]

# Obvious non-secrets that otherwise trip the generic rule.
PLACEHOLDERS = re.compile(
    r"(?i)^(?:your[_\-]?|my[_\-]?|the[_\-]?|some[_\-]?|example[_\-]?|test[_\-]?|dummy[_\-]?|fake[_\-]?|"
    r"placeholder|redacted|xxx+|\*+|<[^>]+>|\.\.\.|none|null|true|false|changeme|password|secret)"
)


def redact(value: str) -> str:
    """Show just enough to recognise which credential this is, and no more."""
    v = value.strip()
    if len(v) <= 8:
        return "•" * len(v)
    return f"{v[:4]}{'•' * 8}{v[-2:]}"


def _iter_strings(value: Any, path: str = ""):
    """Walk a row, yielding every (field_path, string) inside it."""
    if isinstance(value, str):
        yield path, value
    elif isinstance(value, dict):
        for k, v in value.items():
            yield from _iter_strings(v, f"{path}.{k}" if path else str(k))
    elif isinstance(value, (list, tuple)):
        for i, v in enumerate(value):
            yield from _iter_strings(v, f"{path}.{i}" if path else str(i))


def scan_text(text: str) -> list[dict[str, str]]:
    """Return every credential-looking match in a single string."""
    hits: list[dict[str, str]] = []
    seen: set[str] = set()
    for label, pattern in PATTERNS:
        for m in pattern.finditer(text):
            # Prefer the captured value (generic rule) over the whole match.
            raw = (m.group(1) if m.groups() else m.group(0)) or ""
            raw = raw.strip()
            if not raw or raw in seen:
                continue
            if PLACEHOLDERS.match(raw):
                continue
            seen.add(raw)
            hits.append({"label": label, "match": redact(raw)})
    return hits


def scan_rows(rows: list[dict[str, Any]], max_report: int = 25) -> dict[str, Any]:
    """Scan a list of rows.

    Returns {count, rows_affected, findings[], labels{}} where findings is a
    capped sample suitable for showing in the UI — enough to judge, not so much
    that it becomes a wall of text.
    """
    findings: list[dict[str, Any]] = []
    affected: set[int] = set()
    labels: dict[str, int] = {}
    total = 0

    for idx, row in enumerate(rows):
        for field, text in _iter_strings(row):
            if not text or len(text) < 12:
                continue
            for hit in scan_text(text):
                total += 1
                affected.add(idx)
                labels[hit["label"]] = labels.get(hit["label"], 0) + 1
                if len(findings) < max_report:
                    findings.append({"row": idx, "field": field, **hit})

    return {
        "count": total,
        "rows_affected": len(affected),
        "affected_rows": sorted(affected),
        "findings": findings,
        "labels": labels,
    }


def scrub_rows(rows: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], int]:
    """Replace credential-looking substrings with [REDACTED].

    Returns (new_rows, replacements). Used when the user chooses to import
    anyway but wants the secrets stripped rather than the rows dropped.
    """
    count = 0

    def clean(value: Any) -> Any:
        nonlocal count
        if isinstance(value, str):
            out = value
            for label, pattern in PATTERNS:
                def _sub(m: re.Match) -> str:
                    nonlocal count
                    raw = (m.group(1) if m.groups() else m.group(0)) or ""
                    if PLACEHOLDERS.match(raw.strip()):
                        return m.group(0)
                    count += 1
                    # Keep the surrounding text (e.g. "api_key = ") intact so the
                    # example still reads naturally after redaction.
                    return m.group(0).replace(raw, "[REDACTED]") if m.groups() else "[REDACTED]"
                out = pattern.sub(_sub, out)
            return out
        if isinstance(value, dict):
            return {k: clean(v) for k, v in value.items()}
        if isinstance(value, list):
            return [clean(v) for v in value]
        return value

    return [clean(r) for r in rows], count
