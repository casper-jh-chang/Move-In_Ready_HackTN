"""Video analysis service called by the Node app (app/server/vision.cjs).

It is not meant to face the internet: the Node server authenticates donors and proxies to it.
"""

from __future__ import annotations

import logging
import re
import shutil
import uuid
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.staticfiles import StaticFiles

from .config import settings
from .pipeline import load_result, run_intake
from .providers import ModelOutputError, get_provider
from .video import INSTALL_HINT, VideoError, missing_tools

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("vision")

settings.media_dir.mkdir(parents=True, exist_ok=True)
provider = get_provider(settings)
if missing := missing_tools():
    log.error("Missing %s. %s", " and ".join(missing), INSTALL_HINT)

app = FastAPI(title="Move-In Ready · vision service")
app.mount("/media", StaticFiles(directory=settings.media_dir), name="media")

VIDEO_EXTS = {".mp4", ".mov", ".webm", ".m4v", ".mkv", ".3gp", ".avi"}
ID_RE = re.compile(r"^[0-9a-f]{32}$")


@app.get("/health")
def health() -> dict:
    missing = missing_tools()
    return {
        "ok": not missing,
        "provider": provider.name,
        "model": provider.model,
        "inputMode": settings.input_mode if provider.supports_video else "frames",
        "transcribe": settings.transcribe_provider,
        "maxVideoSeconds": settings.max_video_seconds,
        "missingTools": missing,
    }


@app.post("/analyze")
def analyze(video: UploadFile = File(...), transcript: str = Form("")) -> dict:
    ext = Path(video.filename or "").suffix.lower() or ".webm"
    if ext not in VIDEO_EXTS and not (video.content_type or "").startswith("video/"):
        raise HTTPException(400, "Please upload a video file.")
    intake_id = uuid.uuid4().hex
    work = settings.media_dir / intake_id
    work.mkdir(parents=True)
    source = work / f"source{ext if ext in VIDEO_EXTS else '.webm'}"
    with source.open("wb") as fh:
        shutil.copyfileobj(video.file, fh)
    if source.stat().st_size > settings.max_upload_mb * 1024 * 1024:
        shutil.rmtree(work, ignore_errors=True)
        raise HTTPException(413, f"Video is larger than {settings.max_upload_mb} MB.")

    # The mock provider is keyword-driven; let the file name stand in for narration in demos.
    if provider.name == "mock" and not transcript:
        transcript = Path(video.filename or "").stem.replace("_", " ").replace("-", " ")
    try:
        return run_intake(source, intake_id, settings=settings, provider=provider, client_transcript=transcript)
    except VideoError as e:
        shutil.rmtree(work, ignore_errors=True)
        raise HTTPException(422, str(e)) from e
    except ModelOutputError as e:
        log.exception("model output")
        raise HTTPException(502, f"The AI model returned an unusable answer: {e}") from e
    except Exception as e:
        log.exception("analysis failed")
        raise HTTPException(502, f"Analysis failed: {e}") from e


@app.get("/intake/{intake_id}")
def get_intake(intake_id: str) -> dict:
    result = load_result(settings, intake_id) if ID_RE.match(intake_id) else None
    if not result:
        raise HTTPException(404, "Analysis not found")
    return result
