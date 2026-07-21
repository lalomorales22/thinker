"""
Central configuration and filesystem paths for the Thinker backend.

Everything that used to be scattered as CWD-relative strings ("data_storage",
"../data") lives here as one absolute source of truth so uploads and
HuggingFace imports land in the SAME place and the training loop can find them.
"""
import os
from pathlib import Path

# backend/ directory (this file lives in backend/)
BASE_DIR = Path(__file__).resolve().parent

# Single storage root for everything the app persists.
# Override with THINKER_DATA_DIR if you want it elsewhere.
DATA_DIR = Path(os.getenv("THINKER_DATA_DIR", BASE_DIR / "storage")).resolve()

# Where uploaded + imported dataset files are written (one unified folder).
DATASETS_DIR = DATA_DIR / "datasets"

# SQLite database file (datasets, models, jobs, metrics, preferences).
DB_PATH = DATA_DIR / "thinker.db"

# Cached copy of the live model catalog (models.json) so we work offline.
CATALOG_CACHE_PATH = DATA_DIR / "model_catalog.json"

# Ensure directories exist at import time.
for _p in (DATA_DIR, DATASETS_DIR):
    _p.mkdir(parents=True, exist_ok=True)


# --- External services -------------------------------------------------------

TINKER_MODELS_URL = "https://tinker-docs.thinkingmachines.ai/tinker/models.json"

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2")


def get_tinker_api_key(header_key: str | None = None) -> str | None:
    """Resolve the Tinker API key from an explicit header value, then env.

    Treats empty strings as "not provided". Never logs the key itself.
    """
    key = (header_key or "").strip() or os.getenv("TINKER_API_KEY", "").strip()
    return key or None


def get_anthropic_api_key(header_key: str | None = None) -> str | None:
    """Resolve the Anthropic API key from an explicit header value, then env.

    Used only for the optional Claude teacher in the Voice page — Thinker's
    training path never touches it. Same rules as the Tinker key: empty strings
    count as absent, and the key itself is never logged.
    """
    key = (header_key or "").strip() or os.getenv("ANTHROPIC_API_KEY", "").strip()
    return key or None


def mask_key(key: str | None) -> str:
    """Return a safe, masked representation of an API key for logging."""
    if not key:
        return "<none>"
    if len(key) <= 12:
        return key[:2] + "…"
    return f"{key[:6]}…{key[-4:]}"
