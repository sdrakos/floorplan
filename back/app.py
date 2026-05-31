"""FastAPI entrypoint — thin: CORS + include routers only."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import detect

app = FastAPI(title="FloorPlan Room Detection", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          # browser front-end calls this locally
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(detect.router)
