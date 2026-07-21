"""
Thinker Backend — FastAPI server.

A friendly studio over the Tinker fine-tuning SDK: supervised, preference (DPO),
and reinforcement learning, with HuggingFace dataset import wired straight into
training, a live model catalog, and honest job/metric reporting (no fake data).
"""
import os
# Torch + the Tinker SDK can each link a copy of libomp; on macOS that aborts the
# process with "OMP: Error #15" unless we allow the duplicate. Set before any
# import that may pull torch/tinker.
os.environ.setdefault("KMP_DUPLICATE_LIB_OK", "TRUE")

from dotenv import load_dotenv

load_dotenv()

import warnings
warnings.filterwarnings("ignore", category=UserWarning, module="pydantic")

from contextlib import asynccontextmanager
from typing import Optional
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
import uvicorn

import db
import catalog
from config import get_tinker_api_key, mask_key
from events import hub
from routes import training, models, chat, datasets, analytics, assistant, huggingface, export, seeds
from utils import (
    logger,
    ThinkerException,
    thinker_exception_handler,
    http_exception_handler,
    validation_exception_handler,
    general_exception_handler,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("🧠 Thinker backend starting…")
    db.init_db()
    key = get_tinker_api_key()
    logger.info(f"Tinker API key: {'set (' + mask_key(key) + ')' if key else 'NOT set'}")
    try:
        cat = await catalog.get_catalog(refresh=True)
        logger.info(f"Model catalog: {len(cat['models'])} models ({cat['source']})")
    except Exception as e:
        logger.warning(f"Model catalog warm-up failed: {e}")
    yield
    logger.info("🧠 Thinker backend shutting down…")


app = FastAPI(
    title="Thinker API",
    description="A friendly studio for fine-tuning open models with Tinker",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_exception_handler(ThinkerException, thinker_exception_handler)
app.add_exception_handler(StarletteHTTPException, http_exception_handler)
app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(Exception, general_exception_handler)

app.include_router(training.router, prefix="/api/training", tags=["training"])
app.include_router(models.router, prefix="/api/models", tags=["models"])
app.include_router(chat.router, prefix="/api/chat", tags=["chat"])
app.include_router(datasets.router, prefix="/api/datasets", tags=["datasets"])
app.include_router(analytics.router, prefix="/api/analytics", tags=["analytics"])
app.include_router(assistant.router, prefix="/api/assistant", tags=["assistant"])
app.include_router(huggingface.router, prefix="/api/huggingface", tags=["huggingface"])
app.include_router(export.router, prefix="/api/export", tags=["export"])
app.include_router(seeds.router, prefix="/api/seeds", tags=["seeds"])


@app.get("/")
async def root():
    return {"app": "Thinker", "version": "2.0.0", "status": "running"}


@app.get("/api/health")
async def health(x_api_key: Optional[str] = Header(None)):
    """Honest health: real key presence, SDK availability, and catalog source."""
    from training.engine import check_tinker
    key = get_tinker_api_key(x_api_key)
    sdk = check_tinker()
    cat = await catalog.get_catalog()
    return {
        "status": "healthy",
        "tinker_api_key": bool(key),
        "tinker_sdk": sdk,
        "catalog_source": cat["source"],
        "catalog_count": len(cat["models"]),
        "ws_clients": hub.count,
    }


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await hub.connect(websocket)
    try:
        await websocket.send_json({"type": "hello", "data": {"message": "connected"}})
        while True:
            # Keep the socket open; clients don't need to send anything.
            await websocket.receive_text()
    except WebSocketDisconnect:
        hub.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        hub.disconnect(websocket)


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True, log_level="info")
