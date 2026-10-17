"""Video in, inventory rows out.

upload -> probe -> sharp keyframes (+ audio / transcript) -> multimodal model extracts facts
-> rules engine decides -> frames grabbed at the cited timestamps -> rows written to inventory.
"""

from __future__ import annotations

import json
import logging
import uuid
from pathlib import Path

from . import rules as rules_mod
from . import video as v
from .config import Settings
from .db import DB, INITIAL_STATUS, now
from .providers import ModelInput, Provider, transcribe

log = logging.getLogger(__name__)


def media_url(settings: Settings, path: Path) -> str:
    return "/media/" + path.relative_to(settings.media_dir).as_posix()


def run_intake(
    source: Path,
    intake_id: str,
    *,
    settings: Settings,
    provider: Provider,
    db: DB,
    donor: dict,
    client_transcript: str = "",
) -> dict:
    work = source.parent
    info = v.probe(source)
    if info.duration > settings.max_video_seconds + 1:
        raise v.VideoError(f"Video is {info.duration:.0f}s; please keep it under {settings.max_video_seconds}s.")

    frames = v.extract_keyframes(source, work / "frames", info.duration, n=settings.num_keyframes)
    playback = v.to_browser_mp4(source, work / "playback.mp4")

    mode = settings.input_mode if provider.name != "mock" else "frames"
    transcript = client_transcript.strip()
    inp = ModelInput(mode=mode, frames=frames, duration=info.duration, transcript=transcript)
    if mode == "video":
        inp.model_video = v.transcode_for_model(source, work / "model.mp4", settings.max_video_seconds)
    else:
        if not transcript and info.has_audio:
            audio = v.extract_audio(source, work / "audio.wav")
            if audio:
                try:
                    inp.transcript = transcribe(audio, settings)
                except Exception as e:  # transcription is best-effort; the frames still get analysed
                    log.warning("transcription failed: %s", e)
        if settings.vision_provider == "oci" and "llama-3.2" in settings.oci_model_id:
            inp.contact_sheet = v.contact_sheet(frames, work / "sheet.jpg")  # one image per request

    analysis = provider.analyze(inp)
    if not analysis.transcript:
        analysis.transcript = inp.transcript

    rules = rules_mod.load_rules(settings.rules_file)
    created = now()
    db.insert_intake({
        "id": intake_id, "created_at": created,
        "donor_name": donor.get("name", ""), "donor_zip": donor.get("zip", ""), "donor_contact": donor.get("contact", ""),
        "provider": f"{provider.name}:{provider.model}",
        "mode": mode, "duration": info.duration,
        "transcript": analysis.transcript,
        "analysis_json": analysis.model_dump_json(),
        "frames_json": json.dumps([{"url": media_url(settings, f.path), "t": f.t} for f in frames]),
        "video_url": media_url(settings, playback),
    })

    for item in analysis.items:
        decision = rules_mod.evaluate(item, analysis, rules)
        item_id = uuid.uuid4().hex[:12]
        thumb = _frame_at(source, item.best_view_s, frames, work / "items" / f"{item_id}_main.jpg", settings)
        defect_frames = []
        for k, d in enumerate(item.defects):
            if d.timestamp_s is not None:
                p = _frame_at(source, d.timestamp_s, frames, work / "items" / f"{item_id}_d{k}.jpg", settings)
                defect_frames.append({"defect_index": k, "t": d.timestamp_s, "url": p})
        db.insert_item({
            "id": item_id, "intake_id": intake_id, "created_at": created, "updated_at": created,
            "title": item.title, "category": item.category, "room": item.room, "quantity": item.quantity,
            "condition_grade": item.condition_grade,
            "ai_outcome": decision.outcome, "status": INITIAL_STATUS[decision.outcome],
            "est_weight_lbs": decision.est_weight_lbs, "thumb_url": thumb,
            "item_json": item.model_dump_json(), "decision_json": decision.model_dump_json(),
            "defect_frames_json": json.dumps(defect_frames),
        })

    return db.get_intake(intake_id)  # type: ignore[return-value]


def _frame_at(source: Path, t: float | None, frames: list[v.Frame], dest: Path, settings: Settings) -> str:
    """Exact frame at the timestamp the model cited; falls back to the nearest keyframe."""
    if t is not None:
        try:
            return media_url(settings, v.grab_frame(source, t, dest))
        except v.VideoError:
            pass
    target = t if t is not None else frames[0].t
    nearest = min(frames, key=lambda f: abs(f.t - target))
    return media_url(settings, nearest.path)
