"""Video in, structured donation items out.

upload -> probe -> sharp keyframes (+ audio / transcript) -> multimodal model extracts facts
-> rules engine decides -> frames grabbed at the cited timestamps -> result.json on disk.

The service keeps no inventory of its own: the Node app stores donations in MySQL and
fetches a saved result by id when the donor submits, so the AI verdict it stores is the
one this service produced, not one a browser sent.
"""

from __future__ import annotations

import base64
import io
import json
import logging
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image

from . import rules as rules_mod
from . import video as v
from .config import Settings
from .providers import ModelInput, Provider, transcribe

log = logging.getLogger(__name__)

RESULT_FILE = "result.json"


def media_url(settings: Settings, path: Path) -> str:
    return "/media/" + path.relative_to(settings.media_dir).as_posix()


def run_intake(
    source: Path,
    intake_id: str,
    *,
    settings: Settings,
    provider: Provider,
    client_transcript: str = "",
) -> dict:
    work = source.parent
    info = v.probe(source)
    if info.duration > settings.max_video_seconds + 1:
        raise v.VideoError(f"Video is {info.duration:.0f}s; please keep it under {settings.max_video_seconds}s.")

    frames = v.extract_keyframes(source, work / "frames", info.duration, n=settings.num_keyframes)
    playback = v.to_browser_mp4(source, work / "playback.mp4")

    mode = settings.input_mode if provider.supports_video else "frames"
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
        one_image_model = settings.vision_provider == "oci" and "llama-3.2" in settings.oci_model_id
        if settings.frames_as_sheet or one_image_model:
            inp.contact_sheet = v.contact_sheet(frames, work / "sheet.jpg")  # one tiled image per request

    analysis = provider.analyze(inp)
    if not analysis.transcript:
        analysis.transcript = inp.transcript

    rules = rules_mod.load_rules(settings.rules_file)
    items = []
    for idx, item in enumerate(analysis.items):
        decision = rules_mod.evaluate(item, analysis, rules)
        main = _frame_at(source, item.best_view_s, frames, work / "items" / f"{idx}_main.jpg")
        defect_frames = []
        for k, d in enumerate(item.defects):
            if d.timestamp_s is not None:
                p = _frame_at(source, d.timestamp_s, frames, work / "items" / f"{idx}_d{k}.jpg")
                defect_frames.append({"defectIndex": k, "t": d.timestamp_s, "url": media_url(settings, p)})
        items.append({
            "index": idx,
            "item": item.model_dump(),
            "decision": decision.model_dump(),
            "photo": _data_url(main),
            "photoUrl": media_url(settings, main),
            "defectFrames": defect_frames,
        })

    result = {
        "id": intake_id,
        "createdAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "provider": f"{provider.name}:{provider.model}",
        "mode": mode,
        "duration": info.duration,
        "transcript": analysis.transcript,
        "videoUrl": media_url(settings, playback),
        "frames": [{"url": media_url(settings, f.path), "t": f.t} for f in frames],
        "summary": analysis.narration_summary,
        "inconsistencies": analysis.inconsistencies,
        "retakeSuggestions": analysis.retake_suggestions,
        "donorContext": analysis.donor_context.model_dump(),
        "items": items,
    }
    (work / RESULT_FILE).write_text(json.dumps(result))
    return result


def load_result(settings: Settings, intake_id: str) -> dict | None:
    path = settings.media_dir / intake_id / RESULT_FILE
    return json.loads(path.read_text()) if path.exists() else None


def _frame_at(source: Path, t: float | None, frames: list[v.Frame], dest: Path) -> Path:
    """Exact frame at the timestamp the model cited; falls back to the nearest keyframe."""
    if t is not None:
        try:
            return v.grab_frame(source, t, dest)
        except v.VideoError:
            pass
    target = t if t is not None else frames[0].t
    return min(frames, key=lambda f: abs(f.t - target)).path


def _data_url(path: Path, max_px: int = 800) -> str:
    """Small JPEG data URL, the format the app already stores in furniture.photo."""
    with Image.open(path) as im:
        im = im.convert("RGB")
        im.thumbnail((max_px, max_px))
        buf = io.BytesIO()
        im.save(buf, "JPEG", quality=80)
    return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode()
