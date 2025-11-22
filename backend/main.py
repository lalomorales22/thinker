"""
Thinker Backend - FastAPI server for Self-Evolving Code Review Agent
"""
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

import warnings
# Suppress Pydantic warnings from Tinker SDK
warnings.filterwarnings("ignore", category=UserWarning, module="pydantic")

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import socketio
import uvicorn
from typing import List
import asyncio

from routes import training, models, chat, datasets, analytics, assistant, huggingface
from agents.code_review_agent import CodeReviewAgent

# WebSocket manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except:
                pass

manager = ConnectionManager()

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    print("🧠 Thinker Backend Starting...")
    print(f"Tinker API Key: {'✓ Set' if os.getenv('TINKER_API_KEY') else '✗ Missing'}")
    yield
    # Shutdown
    print("🧠 Thinker Backend Shutting Down...")

app = FastAPI(
    title="Thinker API",
    description="Self-Evolving Code Review Agent powered by Tinker",
    version="1.0.0",
    lifespan=lifespan
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(training.router, prefix="/api/training", tags=["training"])
app.include_router(models.router, prefix="/api/models", tags=["models"])
app.include_router(chat.router, prefix="/api/chat", tags=["chat"])
app.include_router(datasets.router, prefix="/api/datasets", tags=["datasets"])
app.include_router(analytics.router, prefix="/api/analytics", tags=["analytics"])
app.include_router(assistant.router, prefix="/api/assistant", tags=["assistant"])
app.include_router(huggingface.router, prefix="/api/huggingface", tags=["huggingface"])

@app.get("/")
async def root():
    return {
        "app": "Thinker",
        "version": "1.0.0",
        "status": "running",
        "made_by": "lalo ❤️"
    }

@app.get("/api/health")
async def health():
    return {
        "status": "healthy",
        "tinker_api_key": "set" if os.getenv("TINKER_API_KEY") else "missing"
    }

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_json()
            # Echo back for now - will handle training updates
            await manager.broadcast({
                "type": "update",
                "data": data
            })
    except WebSocketDisconnect:
        manager.disconnect(websocket)

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
