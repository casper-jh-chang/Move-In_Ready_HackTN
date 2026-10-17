"""ffmpeg helpers: probe, sharp keyframes, audio track, model-sized clip, contact sheet."""

from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageStat


class VideoError(RuntimeError):
    pass


@dataclass
class Frame:
    path: Path
    t: float  # seconds from start
    sharpness: float = 0.0


@dataclass
class VideoInfo:
    duration: float
    width: int
    height: int
    has_audio: bool


def _run(cmd: list[str]) -> str:
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise VideoError(f"{cmd[0]} failed: {proc.stderr.strip()[-500:]}")
    return proc.stdout


def probe(path: Path) -> VideoInfo:
    out = json.loads(_run([
        "ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams", str(path),
    ]))
    streams = out.get("streams", [])
    video = next((s for s in streams if s.get("codec_type") == "video"), None)
    if video is None:
        raise VideoError("No video stream found in upload.")
    duration = float(out.get("format", {}).get("duration") or video.get("duration") or 0)
    if duration <= 0:
        # MediaRecorder webm files often lack a duration header; count it by decoding.
        duration = _decoded_duration(path)
    return VideoInfo(
        duration=duration,
        width=int(video.get("width", 0)),
        height=int(video.get("height", 0)),
        has_audio=any(s.get("codec_type") == "audio" for s in streams),
    )


def _decoded_duration(path: Path) -> float:
    proc = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(path), "-map", "0:v:0", "-f", "null", "-progress", "pipe:1", "-"],
        capture_output=True, text=True,
    )
    times = [line.split("=", 1)[1] for line in proc.stdout.splitlines() if line.startswith("out_time_us=")]
    us = [int(t) for t in times if t.strip().lstrip("-").isdigit()]
    return max(us, default=0) / 1e6


def sharpness(img: Image.Image) -> float:
    """Edge variance: higher means less motion blur."""
    edges = img.convert("L").resize((320, int(320 * img.height / max(img.width, 1)))).filter(ImageFilter.FIND_EDGES)
    return ImageStat.Stat(edges).var[0]


def extract_keyframes(path: Path, out_dir: Path, duration: float, n: int = 8, candidates_per_slot: int = 4) -> list[Frame]:
    """Split the clip into n equal slots and keep the sharpest frame in each.

    Walk-around phone videos are full of motion blur; picking the sharpest candidate
    per slot gives the model clear views from every angle without sending every frame.
    """
    out_dir.mkdir(parents=True, exist_ok=True)
    duration = max(duration, 0.5)
    fps = min(n * candidates_per_slot / duration, 10)
    with tempfile.TemporaryDirectory() as tmp:
        _run([
            "ffmpeg", "-v", "error", "-i", str(path), "-vf", f"fps={fps:.4f},scale='min(1024,iw)':-2",
            "-q:v", "3", str(Path(tmp) / "c_%04d.jpg"),
        ])
        cands = sorted(Path(tmp).glob("c_*.jpg"))
        if not cands:
            raise VideoError("Could not read any frames from the video.")
        scored = []
        for i, p in enumerate(cands):
            with Image.open(p) as im:
                scored.append(Frame(path=p, t=round(i / fps, 2), sharpness=sharpness(im)))
        slots = min(n, len(scored))
        frames = []
        for s in range(slots):
            chunk = scored[s * len(scored) // slots:(s + 1) * len(scored) // slots]
            best = max(chunk, key=lambda f: f.sharpness)
            dest = out_dir / f"frame_{s + 1:02d}.jpg"
            shutil.copy(best.path, dest)
            frames.append(Frame(path=dest, t=best.t, sharpness=best.sharpness))
    return frames


def grab_frame(path: Path, t: float, dest: Path, width: int = 1024) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    _run([
        "ffmpeg", "-v", "error", "-y", "-ss", f"{max(t, 0):.2f}", "-i", str(path),
        "-frames:v", "1", "-vf", f"scale='min({width},iw)':-2", "-q:v", "3", str(dest),
    ])
    if not dest.exists():
        raise VideoError(f"No frame at {t:.2f}s")
    return dest


def extract_audio(path: Path, dest: Path) -> Path | None:
    """16 kHz mono wav for speech-to-text. None if the clip has no audio."""
    try:
        _run(["ffmpeg", "-v", "error", "-y", "-i", str(path), "-vn", "-ac", "1", "-ar", "16000", str(dest)])
    except VideoError:
        return None
    return dest if dest.exists() and dest.stat().st_size > 1000 else None


def transcode_for_model(path: Path, dest: Path, max_seconds: int) -> Path:
    """Small 480p mp4 with audio, so an inline video request stays a few MB."""
    _run([
        "ffmpeg", "-v", "error", "-y", "-i", str(path), "-t", str(max_seconds),
        "-vf", "scale=-2:'min(480,ih)',fps=15", "-c:v", "libx264", "-preset", "veryfast", "-crf", "30",
        "-c:a", "aac", "-b:a", "64k", "-ac", "1", "-movflags", "+faststart", str(dest),
    ])
    return dest


def to_browser_mp4(path: Path, dest: Path) -> Path:
    """H.264 copy for playback in the review UI (phones upload .mov/.webm)."""
    _run([
        "ffmpeg", "-v", "error", "-y", "-i", str(path), "-vf", "scale=-2:'min(720,ih)'",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "26", "-c:a", "aac", "-b:a", "96k",
        "-movflags", "+faststart", str(dest),
    ])
    return dest


def contact_sheet(frames: list[Frame], dest: Path, cols: int = 3, cell_w: int = 512) -> Path:
    """Tile keyframes into one labelled image, for models that accept only one image per request."""
    rows = -(-len(frames) // cols)
    with Image.open(frames[0].path) as first:
        cell_h = int(cell_w * first.height / first.width)
    sheet = Image.new("RGB", (cols * cell_w, rows * cell_h), "white")
    draw = ImageDraw.Draw(sheet)
    for i, f in enumerate(frames):
        with Image.open(f.path) as im:
            tile = im.convert("RGB").resize((cell_w, cell_h))
        x, y = (i % cols) * cell_w, (i // cols) * cell_h
        sheet.paste(tile, (x, y))
        label = f"#{i + 1}  t={f.t:.1f}s"
        draw.rectangle([x, y, x + 9 * len(label) + 12, y + 22], fill="black")
        draw.text((x + 6, y + 5), label, fill="white")
    sheet.save(dest, quality=85)
    return dest
