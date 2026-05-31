"""FastAPI entrypoint — thin: CORS + include routers only.

Run either way:
  python back/app.py                              # auto-uses the project venv
  back/.venv/Scripts/uvicorn back.app:app --port 8000
"""
# --- Foolproof venv bootstrap (runs ONLY as a script, before heavy imports) ---
if __name__ == "__main__":
    import os as _os
    import sys as _sys
    _root = _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__)))
    _venv_py = _os.path.join(_root, "back", ".venv", "Scripts", "python.exe")
    if _os.path.exists(_venv_py) and _os.path.abspath(_sys.executable).lower() != _venv_py.lower():
        import subprocess as _sp
        print(f"[app] re-exec under venv: {_venv_py}")
        raise SystemExit(_sp.run([_venv_py, _os.path.abspath(__file__)]).returncode)

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
    print("[app] FloorPlan Room Detection on http://127.0.0.1:8000  (Ctrl+C to stop)")
    uvicorn.run(app, host="127.0.0.1", port=8000)
