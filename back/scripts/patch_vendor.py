"""Idempotent patches to the vendored CubiCasa5K so it runs on a modern stack
(Python 3.13, numpy>=2, scipy>=1.14, torch>=2.6).

Run after cloning the vendor:
  git clone --depth 1 https://github.com/EmanuelKuhn/CubiCasa5k \
      back/detector/cubicasa_model/vendor
  back/.venv/Scripts/python back/scripts/patch_vendor.py
"""
import os

HERE = os.path.dirname(os.path.abspath(__file__))
VENDOR = os.path.join(HERE, "..", "detector", "cubicasa_model", "vendor")

# (file, old, new) — each applied only if `old` is still present.
PATCHES = [
    (
        os.path.join(VENDOR, "floortrans", "post_prosessing.py"),
        "from scipy.ndimage import measurements",
        "from scipy import ndimage as measurements  # patched: scipy>=1.14 removed scipy.ndimage.measurements",
    ),
    # init_weights uses a CWD-relative path for the MPII backbone init; make it absolute.
    (
        os.path.join(VENDOR, "floortrans", "models", "hg_furukawa_original.py"),
        "        model.load_state_dict(torch.load('floortrans/models/model_1427.pth'))",
        "        import os as _os  # patched: absolute path + CPU load\n"
        "        model.load_state_dict(torch.load(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), 'model_1427.pth'), map_location='cpu', weights_only=False))",
    ),
    # scipy>=1.11: stats.mode returns a scalar `.mode`; keepdims=True restores [0] indexing.
    (
        os.path.join(VENDOR, "floortrans", "post_prosessing.py"),
        "stats.mode(widths).mode[0]",
        "stats.mode(widths, keepdims=True).mode[0]",
    ),
    # loaders/__init__ pulls dataset deps (lmdb, svgpathtools) we don't need for
    # inference; make them optional so RotateNTurns (for TTA) imports cleanly.
    (
        os.path.join(VENDOR, "floortrans", "loaders", "__init__.py"),
        "from floortrans.loaders.svg_loader import FloorplanSVG\n"
        "from floortrans.loaders import svg_utils\n"
        "from floortrans.loaders.augmentations import *\n"
        "from floortrans.loaders import house",
        "try:  # patched: dataset/svg deps optional for inference\n"
        "    from floortrans.loaders.svg_loader import FloorplanSVG\n"
        "    from floortrans.loaders import svg_utils\n"
        "    from floortrans.loaders import house\n"
        "except ImportError:\n"
        "    pass\n"
        "from floortrans.loaders.augmentations import *",
    ),
]


def main():
    for path, old, new in PATCHES:
        if not os.path.exists(path):
            print(f"SKIP (missing): {path}")
            continue
        with open(path, encoding="utf-8") as f:
            text = f.read()
        if new in text:
            print(f"OK (already patched): {os.path.basename(path)}")
        elif old in text:
            with open(path, "w", encoding="utf-8") as f:
                f.write(text.replace(old, new))
            print(f"PATCHED: {os.path.basename(path)}")
        else:
            print(f"WARN (anchor not found): {os.path.basename(path)}")


if __name__ == "__main__":
    main()
