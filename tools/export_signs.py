"""Export one sequence per clip, which the browser compares with the whole live sign.

The browser collects every frame from when the hands enter the box until they leave it, and averages
those frames into 8 equal parts (sequenceOf in js/knn.js). This script does the same to every clip,
so a sign is matched as a whole: its start, middle and end, in order.

Run after adding or removing clips:
  python tools/export_signs.py
"""
import base64
import json
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1] / "datasettt"
OUT = Path(__file__).resolve().parents[1] / "model" / "signs.json"
STEPS = 8        # parts per sign (STEPS in js/knn.js)
PRESENT = 0.05   # a hand slot counts as present above this total


def frame_pair(frame):
    """Same order as framePair in js/features.js: a lone hand always goes first."""
    a, b = frame[:63], frame[63:126]
    has_a, has_b = np.abs(a).sum() > PRESENT, np.abs(b).sum() > PRESENT
    if has_a and has_b:
        return np.concatenate([a, b])
    return np.concatenate([a if has_a else b, np.zeros(63)])


def sequence(clip):
    """Frames without a hand are skipped, as in the browser; the rest are averaged into STEPS parts."""
    frames = [frame_pair(f) for f in clip[:, :126].astype(np.float64) if np.abs(f).sum() > PRESENT]
    n = len(frames)
    if n < STEPS:
        return None
    parts = []
    for s in range(STEPS):
        a = s * n // STEPS
        b = max(a + 1, (s + 1) * n // STEPS)
        parts.append(np.mean(frames[a:b], axis=0))
    return np.concatenate(parts)


def pack(seq):
    """Values lie in -1..1, so one signed byte each (value x 127) keeps the file small."""
    return base64.b64encode(np.clip(np.round(seq * 127), -127, 127).astype(np.int8).tobytes()).decode("ascii")


def main():
    items = []
    skipped = []
    for label in sorted(path.name for path in ROOT.iterdir() if path.is_dir()):
        for file in sorted((ROOT / label).glob("*.npy")):
            seq = sequence(np.load(file))
            if seq is None:
                skipped.append(file.name)
                continue
            items.append({"l": label, "c": file.stem, "v": pack(seq)})
    payload = {"source": "datasettt", "clips": len(items), "steps": STEPS, "items": items}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {len(items)} clips to {OUT}")
    if skipped:
        print(f"skipped {len(skipped)} clip(s) with fewer than {STEPS} hand frames: {', '.join(skipped)}")


if __name__ == "__main__":
    main()
