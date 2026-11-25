"""Record new sign clips for SilentTalk, in the same format as datasettt/ (the folder tools/export_signs.py reads).

Each clip is a float32 .npy file of 40 frames x 174 numbers:
  0-62    first hand: 21 points x (x, y, z), wrist at the origin, scaled so the farthest point is 1
  63-125  second hand, same layout (zeros for a one-hand sign)
  126-173 16 upper-body pose points x (x, y, z). The app does not read these; they keep the shape the same.

This uses the same hand tracker settings and the same on-screen box as the live app (js/camera.js),
so recorded clips match what the camera sees during translation.

Install once:
  pip install mediapipe opencv-python numpy

Record from the webcam (SPACE starts a clip, Q quits):
  python tools/record_dataset.py record thank_you --count 30

Turn existing videos into clips (one video = one clip):
  python tools/record_dataset.py video thank_you path/to/videos

Then rebuild the model the app reads:
  python tools/export_signs.py
"""
import argparse
import re
import sys
import time
from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np

DATASET = Path(__file__).resolve().parents[1] / "datasettt"  # the folder tools/export_signs.py reads
FRAMES = 40            # frames per clip
MIN_HAND_FRAMES = 20   # a clip needs a hand in at least this many of its 40 frames
ROI = (0.16, 0.10, 0.68, 0.78)  # x, y, w, h: the box in js/camera.js; hands outside it are ignored
# Eight left/right pairs: eyes, ears, mouth, shoulders, elbows, wrists, index fingertips, hips.
POSE_POINTS = (2, 5, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 19, 20, 23, 24)
VIDEO_TYPES = {".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v"}

mp_hands = mp.solutions.hands
mp_pose = mp.solutions.pose
mp_draw = mp.solutions.drawing_utils


def make_trackers(static=False):
    # Same settings as js/camera.js.
    hands = mp_hands.Hands(static_image_mode=static, max_num_hands=2, model_complexity=0,
                           min_detection_confidence=0.6, min_tracking_confidence=0.5)
    pose = mp_pose.Pose(static_image_mode=static, model_complexity=0)
    return hands, pose


def pack_hand(landmarks):
    """Same as packHand in js/features.js."""
    pts = np.array([[p.x, p.y, p.z] for p in landmarks.landmark[:21]], dtype=np.float64)
    pts -= pts[0]
    scale = np.linalg.norm(pts, axis=1).max()
    if scale < 1e-6:
        return np.zeros(63)
    return (pts / scale).reshape(-1)


def in_roi(landmarks):
    wrist = landmarks.landmark[0]
    x, y, w, h = ROI
    return x <= wrist.x <= x + w and y <= wrist.y <= y + h


def hand_slots(hand_result):
    """Hands inside the box, in the order js/features.js uses: a lone hand first, two hands right then left."""
    found = []
    for i, lm in enumerate(hand_result.multi_hand_landmarks or []):
        if not in_roi(lm):
            continue
        side = hand_result.multi_handedness[i].classification[0].label if hand_result.multi_handedness else "Right"
        found.append((side, lm))
    if not found:
        return np.zeros(63), np.zeros(63), 0
    if len(found) == 1:
        return pack_hand(found[0][1]), np.zeros(63), 1
    found = found[:2]
    sides = {side for side, _ in found}
    if sides == {"Right", "Left"}:
        found.sort(key=lambda item: 0 if item[0] == "Right" else 1)
    else:
        found.sort(key=lambda item: item[1].landmark[0].x)
    return pack_hand(found[0][1]), pack_hand(found[1][1]), 2


def pose_block(pose_result):
    """Pose points centred on the shoulders and scaled by shoulder width. Not used by the app."""
    out = np.zeros(len(POSE_POINTS) * 3)
    if not pose_result.pose_landmarks:
        return out
    lm = pose_result.pose_landmarks.landmark
    left, right = np.array([lm[11].x, lm[11].y, lm[11].z]), np.array([lm[12].x, lm[12].y, lm[12].z])
    width = np.linalg.norm(left - right)
    if width < 1e-6:
        return out
    centre = (left + right) / 2
    for i, idx in enumerate(POSE_POINTS):
        p = lm[idx]
        if p.visibility < 0.5:
            continue
        out[i * 3:i * 3 + 3] = (np.array([p.x, p.y, p.z]) - centre) / width
    return out


def frame_features(rgb, hands, pose):
    hand_result = hands.process(rgb)
    first, second, count = hand_slots(hand_result)
    return np.concatenate([first, second, pose_block(pose.process(rgb))]), count, hand_result


def to_clip(rows):
    """Trim to the part where a hand is visible, then take 40 evenly spaced frames."""
    shown = [i for i, row in enumerate(rows) if np.abs(row[:126]).sum() > 0.05]
    if not shown:
        return None
    rows = rows[shown[0]:shown[-1] + 1]
    pick = np.linspace(0, len(rows) - 1, FRAMES).round().astype(int)
    clip = np.array([rows[i] for i in pick], dtype=np.float32)
    present = int((np.abs(clip[:, :126]).sum(axis=1) > 0.05).sum())
    return clip if present >= MIN_HAND_FRAMES else None


def next_index(folder, label):
    numbers = [int(m.group(1)) for f in folder.glob(f"{label}_*.npy")
               if (m := re.fullmatch(rf"{re.escape(label)}_(\d+)", f.stem))]
    return max(numbers, default=0) + 1


def save_clip(clip, label):
    folder = DATASET / label
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{label}_{next_index(folder, label):04d}.npy"
    np.save(path, clip)
    return path


def check_label(label):
    if not re.fullmatch(r"[a-z0-9_]+", label):
        sys.exit("Use lowercase letters, numbers and underscores for the sign name, e.g. thank_you")


# ---------------------------------------------------------------- webcam

def draw_box(frame, colour):
    h, w = frame.shape[:2]
    x, y, bw, bh = ROI
    cv2.rectangle(frame, (int(x * w), int(y * h)), (int((x + bw) * w), int((y + bh) * h)), colour, 2)


def banner(frame, text, colour=(255, 255, 255)):
    cv2.rectangle(frame, (0, 0), (frame.shape[1], 40), (20, 20, 20), -1)
    cv2.putText(frame, text, (12, 27), cv2.FONT_HERSHEY_SIMPLEX, 0.65, colour, 2, cv2.LINE_AA)


def record(label, count, camera, seconds, countdown):
    check_label(label)
    cap = cv2.VideoCapture(camera)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    if not cap.isOpened():
        sys.exit(f"Could not open camera {camera}")
    hands, pose = make_trackers()
    saved, state, started, rows = 0, "idle", 0.0, []
    message = "SPACE: record a clip   Q: quit"
    print(f"Recording '{label}' into {DATASET / label}")
    try:
        while saved < count:
            ok, frame = cap.read()
            if not ok:
                break
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            features, n_hands, hand_result = frame_features(rgb, hands, pose)
            for lm in hand_result.multi_hand_landmarks or []:
                mp_draw.draw_landmarks(frame, lm, mp_hands.HAND_CONNECTIONS)
            now = time.time()

            if state == "countdown":
                left = countdown - (now - started)
                if left <= 0:
                    state, started, rows = "recording", now, []
                else:
                    message = f"Get ready... {int(left) + 1}"
            if state == "recording":
                rows.append(features)
                message = f"RECORDING {now - started:.1f}s / {seconds:.1f}s   hands: {n_hands}"
                if now - started >= seconds:
                    clip = to_clip(rows)
                    if clip is None:
                        message = "Hand not seen enough - keep it inside the box. SPACE to retry"
                        print("  discarded: hand missing in too many frames")
                    else:
                        saved += 1
                        path = save_clip(clip, label)
                        message = f"Saved {saved}/{count}: {path.name}   SPACE: next clip"
                        print(f"  saved {path}")
                    state = "idle"

            colour = {"idle": (180, 180, 180), "countdown": (0, 200, 255), "recording": (0, 0, 255)}[state]
            draw_box(frame, colour)
            # Shown like a mirror for the signer; the saved data is not flipped, same as the app.
            view = cv2.flip(frame, 1)
            banner(view, f"[{label}] {saved}/{count}  {message}", (0, 0, 255) if state == "recording" else (255, 255, 255))
            cv2.imshow("SilentTalk recorder", view)
            key = cv2.waitKey(1) & 0xFF
            if key in (ord("q"), 27):
                break
            if key == ord(" ") and state == "idle":
                state, started = "countdown", time.time()
    finally:
        cap.release()
        cv2.destroyAllWindows()
        hands.close()
        pose.close()
    print(f"Saved {saved} clip(s) for '{label}'. Next: python tools/export_signs.py")


# ---------------------------------------------------------------- videos

def from_videos(label, source):
    check_label(label)
    source = Path(source)
    files = sorted(p for p in source.iterdir() if p.suffix.lower() in VIDEO_TYPES) if source.is_dir() else [source]
    if not files:
        sys.exit(f"No videos found in {source}")
    saved = 0
    for file in files:
        cap = cv2.VideoCapture(str(file))
        hands, pose = make_trackers()
        rows = []
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            rows.append(frame_features(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB), hands, pose)[0])
        cap.release()
        hands.close()
        pose.close()
        clip = to_clip(rows) if rows else None
        if clip is None:
            print(f"  skipped {file.name}: hand not visible inside the box often enough")
            continue
        saved += 1
        print(f"  {file.name} -> {save_clip(clip, label)}")
    print(f"Saved {saved} of {len(files)} video(s) for '{label}'. Next: python tools/export_signs.py")


# ---------------------------------------------------------------- check

def check():
    """Lists every sign with its clip count and flags files that do not match the format."""
    for folder in sorted(p for p in DATASET.iterdir() if p.is_dir()):
        files = sorted(folder.glob("*.npy"))
        bad = []
        for f in files:
            clip = np.load(f)
            hands = (np.abs(clip[:, :126]).sum(axis=1) > 0.05).sum() if clip.ndim == 2 else 0
            if clip.shape != (FRAMES, 174) or hands < 10:
                bad.append(f"{f.name} shape={clip.shape} hand-frames={hands}")
        note = "" if len(files) >= 20 else "  <- fewer than 20 clips"
        print(f"{folder.name:<16} {len(files):>3} clips{note}")
        for line in bad:
            print(f"    problem: {line}")


def main():
    parser = argparse.ArgumentParser(description="Create SilentTalk sign clips.")
    sub = parser.add_subparsers(dest="command", required=True)
    rec = sub.add_parser("record", help="record clips from the webcam")
    rec.add_argument("label", help="sign name, e.g. thank_you")
    rec.add_argument("--count", type=int, default=30, help="clips to record (default 30)")
    rec.add_argument("--camera", type=int, default=0, help="camera number (default 0)")
    rec.add_argument("--seconds", type=float, default=2.0, help="length of each clip (default 2.0)")
    rec.add_argument("--countdown", type=float, default=2.0, help="countdown before each clip (default 2.0)")
    vid = sub.add_parser("video", help="turn video files into clips")
    vid.add_argument("label", help="sign name, e.g. thank_you")
    vid.add_argument("source", help="a video file or a folder of videos")
    sub.add_parser("check", help="list signs and clip counts, and flag bad files")
    args = parser.parse_args()

    if args.command == "record":
        record(args.label, args.count, args.camera, args.seconds, args.countdown)
    elif args.command == "video":
        from_videos(args.label, args.source)
    else:
        check()


if __name__ == "__main__":
    main()
