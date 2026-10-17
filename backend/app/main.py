"""HTTP API for video intake and the inventory it feeds."""

from __future__ import annotations

import logging
import shutil
import uuid
from pathlib import Path
from typing import Literal, Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .config import BACKEND_DIR, settings
from .db import DB, STATUSES
from .pipeline import run_intake
from .providers import ModelOutputError, get_provider
from .video import VideoError

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("intake")

settings.media_dir.mkdir(parents=True, exist_ok=True)
db = DB(settings.db_path)
provider = get_provider(settings)

app = FastAPI(title="Move-In Ready · video intake")
app.mount("/media", StaticFiles(directory=settings.media_dir), name="media")

VIDEO_EXTS = {".mp4", ".mov", ".webm", ".m4v", ".mkv", ".3gp", ".avi"}


@app.get("/api/config")
def config() -> dict:
    return {
        "provider": provider.name,
        "model": provider.model,
        "input_mode": settings.input_mode if provider.name != "mock" else "frames",
        "max_video_seconds": settings.max_video_seconds,
        "statuses": STATUSES,
    }


@app.post("/api/intake")
def create_intake(
    video: UploadFile = File(...),
    transcript: str = Form(""),
    donor_name: str = Form(""),
    donor_zip: str = Form(""),
    donor_contact: str = Form(""),
) -> dict:
    ext = Path(video.filename or "").suffix.lower() or ".webm"
    if ext not in VIDEO_EXTS and not (video.content_type or "").startswith("video/"):
        raise HTTPException(400, "Please upload a video file.")
    intake_id = uuid.uuid4().hex[:12]
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
        return run_intake(
            source, intake_id, settings=settings, provider=provider, db=db,
            donor={"name": donor_name, "zip": donor_zip, "contact": donor_contact},
            client_transcript=transcript,
        )
    except VideoError as e:
        shutil.rmtree(work, ignore_errors=True)
        raise HTTPException(422, str(e)) from e
    except ModelOutputError as e:
        log.exception("model output")
        raise HTTPException(502, f"The AI model returned an unusable answer: {e}") from e
    except Exception as e:
        log.exception("intake failed")
        raise HTTPException(502, f"Analysis failed: {e}") from e


@app.get("/api/intake/{intake_id}")
def get_intake(intake_id: str) -> dict:
    intake = db.get_intake(intake_id)
    if not intake:
        raise HTTPException(404, "Intake not found")
    return intake


@app.get("/api/inventory")
def list_inventory(status: Optional[str] = None) -> list[dict]:
    return db.list_items(status)


@app.get("/api/stats")
def stats() -> dict:
    return db.stats()


class ItemUpdate(BaseModel):
    status: Optional[Literal[STATUSES]] = None  # type: ignore[valid-type]
    reviewer_note: Optional[str] = None
    title: Optional[str] = None
    human_verified: Optional[bool] = None


@app.patch("/api/inventory/{item_id}")
def update_item(item_id: str, body: ItemUpdate) -> dict:
    if not db.get_item(item_id):
        raise HTTPException(404, "Item not found")
    fields = body.model_dump(exclude_none=True)
    if "status" in fields and "human_verified" not in fields:
        fields["human_verified"] = True  # a volunteer moving an item counts as review
    if "human_verified" in fields:
        fields["human_verified"] = int(fields["human_verified"])
    return db.update_item(item_id, fields)  # type: ignore[return-value]


# Serve the built frontend (npm run build) from the same origin when it exists.
_dist = BACKEND_DIR.parent / "frontend" / "dist"
if _dist.exists():
    app.mount("/", StaticFiles(directory=_dist, html=True), name="frontend")
