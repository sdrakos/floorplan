"""Download CubiCasa5K trained weights from Google Drive and sanitize them to a
pure `state_dict` so the runtime can load with `weights_only=True` (no arbitrary
unpickling).

  back/.venv/Scripts/python back/scripts/download_weights.py

Produces:
  weights/model_best_val_loss_var.pkl   (raw download — trusted, one-time use)
  weights/cubicasa_state_dict.pth       (sanitized; what the detector loads)
"""
import os
import sys
import torch

HERE = os.path.dirname(os.path.abspath(__file__))
WEIGHTS_DIR = os.path.join(HERE, "..", "detector", "cubicasa_model", "weights")
RAW = os.path.join(WEIGHTS_DIR, "model_best_val_loss_var.pkl")
DST = os.path.join(WEIGHTS_DIR, "cubicasa_state_dict.pth")
GDRIVE_ID = "1gRB7ez1e4H7a9Y09lLqRuna0luZO5VRK"


def ensure_raw():
    if os.path.exists(RAW):
        return
    os.makedirs(WEIGHTS_DIR, exist_ok=True)
    try:
        import gdown
    except ImportError:
        sys.exit("pip install gdown, or place the .pkl manually at:\n  " + RAW)
    gdown.download(f"https://drive.google.com/uc?id={GDRIVE_ID}", RAW, quiet=False)


def main():
    ensure_raw()
    if not os.path.exists(RAW):
        sys.exit(f"Download failed. Place the weights manually at:\n  {RAW}")
    # One-time, trusted conversion of the research checkpoint -> pure tensors.
    ckpt = torch.load(RAW, map_location="cpu", weights_only=False)
    state = ckpt["model_state"] if isinstance(ckpt, dict) and "model_state" in ckpt else ckpt
    torch.save(state, DST)
    print(f"Wrote sanitized state_dict -> {DST}")


if __name__ == "__main__":
    main()
