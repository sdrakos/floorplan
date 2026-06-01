"""FastAPI entrypoint — thin: CORS + include routers only.

Run:
  python back/app.py            # uses the current (global) Python environment
  uvicorn back.app:app --port 8000
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

try:  # works as a package module (uvicorn back.app:app)
    from .routers import detect, projects, offers
except ImportError:  # works as a plain script (python back/app.py)
    import os
    import sys
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from back.routers import detect, projects, offers

app = FastAPI(title="FloorPlan Room Detection", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          # browser front-end calls this locally
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(detect.router)
app.include_router(projects.router)
app.include_router(offers.router)


if __name__ == "__main__":
    import uvicorn
    print("[app] FloorPlan Room Detection on http://127.0.0.1:8000  (Ctrl+C to stop)")
    uvicorn.run(app, host="127.0.0.1", port=8000)
