"""
SQLite persistence for Thinker.

Replaces the old in-memory dicts (datasets, saved_models, training_jobs,
import_progress_store) that were wiped on every restart and seeded with fake
demo rows. Everything real the app produces — uploaded/imported datasets,
trained models, training jobs, per-step metrics, and human feedback — now
survives a restart.

Design notes:
- One connection per call (safe across FastAPI's threadpool + background tasks).
- WAL mode + busy_timeout so concurrent reads/writes don't error.
- Rich/nested fields are stored as JSON text and (de)serialized at the boundary.
"""
import json
import sqlite3
import threading
import time
from typing import Any, Optional

from config import DB_PATH

_INIT_LOCK = threading.Lock()
_INITIALIZED = False


def _conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH, timeout=30.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA busy_timeout=30000;")
    conn.execute("PRAGMA foreign_keys=ON;")
    return conn


def init_db() -> None:
    """Create tables if they don't exist. Idempotent; safe to call on startup."""
    global _INITIALIZED
    with _INIT_LOCK:
        if _INITIALIZED:
            return
        with _conn() as c:
            c.executescript(
                """
                CREATE TABLE IF NOT EXISTS datasets (
                    id           TEXT PRIMARY KEY,
                    name         TEXT NOT NULL,
                    source       TEXT NOT NULL DEFAULT 'upload',   -- upload | huggingface | generated | feedback
                    training_type TEXT NOT NULL DEFAULT 'sl',      -- sl | dpo | rl | any
                    format       TEXT NOT NULL DEFAULT 'jsonl',
                    path         TEXT NOT NULL,
                    num_samples  INTEGER NOT NULL DEFAULT 0,
                    size_bytes   INTEGER NOT NULL DEFAULT 0,
                    columns      TEXT NOT NULL DEFAULT '[]',        -- JSON list of detected fields
                    split        TEXT NOT NULL DEFAULT '{}',        -- JSON {train,validation,test}
                    schema_ok    INTEGER NOT NULL DEFAULT 1,
                    schema_notes TEXT NOT NULL DEFAULT '[]',        -- JSON list of validation notes
                    meta         TEXT NOT NULL DEFAULT '{}',        -- JSON blob (hf source, subset, etc.)
                    created_at   TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS models (
                    id            TEXT PRIMARY KEY,                 -- model name (unique)
                    base_model    TEXT NOT NULL,
                    training_type TEXT NOT NULL DEFAULT 'sl',
                    status        TEXT NOT NULL DEFAULT 'ready',    -- ready | archived
                    tinker_path   TEXT,                             -- resumable state path
                    sampler_path  TEXT,                             -- sampler weights path (for inference)
                    size_mb       REAL NOT NULL DEFAULT 0,
                    job_id        TEXT,
                    config        TEXT NOT NULL DEFAULT '{}',       -- JSON training config
                    final_metrics TEXT NOT NULL DEFAULT '{}',       -- JSON
                    created_at    TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS jobs (
                    id            TEXT PRIMARY KEY,
                    name          TEXT NOT NULL DEFAULT '',
                    kind          TEXT NOT NULL DEFAULT 'sl',       -- sl | dpo | rl | multi_agent
                    status        TEXT NOT NULL DEFAULT 'queued',   -- queued|running|completed|failed|cancelled
                    base_model    TEXT NOT NULL DEFAULT '',
                    dataset_id    TEXT,
                    config        TEXT NOT NULL DEFAULT '{}',
                    current_step  INTEGER NOT NULL DEFAULT 0,
                    total_steps   INTEGER NOT NULL DEFAULT 0,
                    status_message TEXT NOT NULL DEFAULT '',
                    error         TEXT,
                    result        TEXT NOT NULL DEFAULT '{}',       -- JSON (final summary, checkpoints)
                    created_at    TEXT NOT NULL,
                    started_at    TEXT,
                    completed_at  TEXT
                );

                CREATE TABLE IF NOT EXISTS metrics (
                    id      INTEGER PRIMARY KEY AUTOINCREMENT,
                    job_id  TEXT NOT NULL,
                    step    INTEGER NOT NULL,
                    ts      REAL NOT NULL,
                    data    TEXT NOT NULL DEFAULT '{}'
                );
                CREATE INDEX IF NOT EXISTS idx_metrics_job ON metrics(job_id, step);

                CREATE TABLE IF NOT EXISTS preferences (
                    id         TEXT PRIMARY KEY,
                    prompt     TEXT NOT NULL,
                    chosen     TEXT NOT NULL,
                    rejected   TEXT NOT NULL,
                    source     TEXT NOT NULL DEFAULT 'playground',
                    created_at TEXT NOT NULL
                );
                """
            )
        _INITIALIZED = True


# --- (de)serialization helpers ----------------------------------------------

_JSON_FIELDS = {
    "datasets": {"columns", "split", "schema_notes", "meta"},
    "models": {"config", "final_metrics"},
    "jobs": {"config", "result"},
}


def _row_to_dict(table: str, row: sqlite3.Row) -> dict[str, Any]:
    d = dict(row)
    for f in _JSON_FIELDS.get(table, set()):
        if f in d and isinstance(d[f], str):
            try:
                d[f] = json.loads(d[f])
            except (json.JSONDecodeError, TypeError):
                d[f] = {} if f in ("split", "meta", "config", "final_metrics") else []
    if table == "datasets":
        d["schema_ok"] = bool(d.get("schema_ok", 1))
    return d


def _dump(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, default=str)


# --- Datasets ----------------------------------------------------------------

def add_dataset(rec: dict[str, Any]) -> dict[str, Any]:
    with _conn() as c:
        c.execute(
            """INSERT INTO datasets
               (id,name,source,training_type,format,path,num_samples,size_bytes,
                columns,split,schema_ok,schema_notes,meta,created_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                rec["id"], rec["name"], rec.get("source", "upload"),
                rec.get("training_type", "sl"), rec.get("format", "jsonl"),
                rec["path"], int(rec.get("num_samples", 0)), int(rec.get("size_bytes", 0)),
                _dump(rec.get("columns", [])), _dump(rec.get("split", {})),
                1 if rec.get("schema_ok", True) else 0, _dump(rec.get("schema_notes", [])),
                _dump(rec.get("meta", {})), rec["created_at"],
            ),
        )
    return get_dataset(rec["id"])


def list_datasets() -> list[dict[str, Any]]:
    with _conn() as c:
        rows = c.execute("SELECT * FROM datasets ORDER BY created_at DESC").fetchall()
    return [_row_to_dict("datasets", r) for r in rows]


def get_dataset(dataset_id: str) -> Optional[dict[str, Any]]:
    with _conn() as c:
        row = c.execute("SELECT * FROM datasets WHERE id=?", (dataset_id,)).fetchone()
    return _row_to_dict("datasets", row) if row else None


def delete_dataset(dataset_id: str) -> bool:
    with _conn() as c:
        cur = c.execute("DELETE FROM datasets WHERE id=?", (dataset_id,))
    return cur.rowcount > 0


# --- Models ------------------------------------------------------------------

def add_model(rec: dict[str, Any]) -> dict[str, Any]:
    with _conn() as c:
        c.execute(
            """INSERT OR REPLACE INTO models
               (id,base_model,training_type,status,tinker_path,sampler_path,size_mb,
                job_id,config,final_metrics,created_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            (
                rec["id"], rec["base_model"], rec.get("training_type", "sl"),
                rec.get("status", "ready"), rec.get("tinker_path"), rec.get("sampler_path"),
                float(rec.get("size_mb", 0)), rec.get("job_id"),
                _dump(rec.get("config", {})), _dump(rec.get("final_metrics", {})),
                rec["created_at"],
            ),
        )
    return get_model(rec["id"])


def list_models() -> list[dict[str, Any]]:
    with _conn() as c:
        rows = c.execute("SELECT * FROM models ORDER BY created_at DESC").fetchall()
    return [_row_to_dict("models", r) for r in rows]


def get_model(model_id: str) -> Optional[dict[str, Any]]:
    with _conn() as c:
        row = c.execute("SELECT * FROM models WHERE id=?", (model_id,)).fetchone()
    return _row_to_dict("models", row) if row else None


def delete_model(model_id: str) -> bool:
    with _conn() as c:
        cur = c.execute("DELETE FROM models WHERE id=?", (model_id,))
    return cur.rowcount > 0


# --- Jobs --------------------------------------------------------------------

def create_job(rec: dict[str, Any]) -> dict[str, Any]:
    with _conn() as c:
        c.execute(
            """INSERT INTO jobs
               (id,name,kind,status,base_model,dataset_id,config,current_step,
                total_steps,status_message,error,result,created_at,started_at,completed_at)
               VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                rec["id"], rec.get("name", ""), rec.get("kind", "sl"),
                rec.get("status", "queued"), rec.get("base_model", ""),
                rec.get("dataset_id"), _dump(rec.get("config", {})),
                int(rec.get("current_step", 0)), int(rec.get("total_steps", 0)),
                rec.get("status_message", ""), rec.get("error"),
                _dump(rec.get("result", {})), rec["created_at"],
                rec.get("started_at"), rec.get("completed_at"),
            ),
        )
    return get_job(rec["id"])


def get_job(job_id: str) -> Optional[dict[str, Any]]:
    with _conn() as c:
        row = c.execute("SELECT * FROM jobs WHERE id=?", (job_id,)).fetchone()
    return _row_to_dict("jobs", row) if row else None


def list_jobs() -> list[dict[str, Any]]:
    with _conn() as c:
        rows = c.execute("SELECT * FROM jobs ORDER BY created_at DESC").fetchall()
    return [_row_to_dict("jobs", r) for r in rows]


_JOB_COLS = {
    "name", "kind", "status", "base_model", "dataset_id", "current_step",
    "total_steps", "status_message", "error", "started_at", "completed_at",
}
_JOB_JSON_COLS = {"config", "result"}


def update_job(job_id: str, **fields: Any) -> Optional[dict[str, Any]]:
    if not fields:
        return get_job(job_id)
    sets, vals = [], []
    for k, v in fields.items():
        if k in _JOB_JSON_COLS:
            sets.append(f"{k}=?")
            vals.append(_dump(v))
        elif k in _JOB_COLS:
            sets.append(f"{k}=?")
            vals.append(v)
    if not sets:
        return get_job(job_id)
    vals.append(job_id)
    with _conn() as c:
        c.execute(f"UPDATE jobs SET {', '.join(sets)} WHERE id=?", vals)
    return get_job(job_id)


def delete_job(job_id: str) -> bool:
    with _conn() as c:
        c.execute("DELETE FROM metrics WHERE job_id=?", (job_id,))
        cur = c.execute("DELETE FROM jobs WHERE id=?", (job_id,))
    return cur.rowcount > 0


# --- Metrics (per-step time series) -----------------------------------------

def add_metric(job_id: str, step: int, data: dict[str, Any]) -> None:
    with _conn() as c:
        c.execute(
            "INSERT INTO metrics (job_id,step,ts,data) VALUES (?,?,?,?)",
            (job_id, int(step), time.time(), _dump(data)),
        )


def get_metrics(job_id: str) -> list[dict[str, Any]]:
    with _conn() as c:
        rows = c.execute(
            "SELECT step,ts,data FROM metrics WHERE job_id=? ORDER BY step ASC",
            (job_id,),
        ).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        try:
            d["data"] = json.loads(d["data"])
        except (json.JSONDecodeError, TypeError):
            d["data"] = {}
        out.append(d)
    return out


def latest_metric(job_id: str) -> dict[str, Any]:
    with _conn() as c:
        row = c.execute(
            "SELECT data FROM metrics WHERE job_id=? ORDER BY step DESC LIMIT 1",
            (job_id,),
        ).fetchone()
    if not row:
        return {}
    try:
        return json.loads(row["data"])
    except (json.JSONDecodeError, TypeError):
        return {}


# --- Preferences (human feedback -> DPO data) --------------------------------

def add_preference(rec: dict[str, Any]) -> None:
    with _conn() as c:
        c.execute(
            "INSERT OR REPLACE INTO preferences (id,prompt,chosen,rejected,source,created_at) VALUES (?,?,?,?,?,?)",
            (rec["id"], rec["prompt"], rec["chosen"], rec["rejected"],
             rec.get("source", "playground"), rec["created_at"]),
        )


def list_preferences() -> list[dict[str, Any]]:
    with _conn() as c:
        rows = c.execute("SELECT * FROM preferences ORDER BY created_at DESC").fetchall()
    return [dict(r) for r in rows]


def count_preferences() -> int:
    with _conn() as c:
        return c.execute("SELECT COUNT(*) AS n FROM preferences").fetchone()["n"]
