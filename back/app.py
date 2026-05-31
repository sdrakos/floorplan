"""FastAPI entrypoint — thin: CORS + include routers only.

Run either way:
  back/.venv/Scripts/python back/app.py          # direct script
  back/.venv/Scripts/uvicorn back.app:app --port 8000
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

try:  # works as a package module (uvicorn back.app:app)
    from .routers import detect
except ImportError:  # works as a plain script (python back/app.py)
    import os
    import sys
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from back.routers import detect

app = FastAPI(title="FloorPlan Room Detection", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          # browser front-end calls this locally
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(detect.router)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
