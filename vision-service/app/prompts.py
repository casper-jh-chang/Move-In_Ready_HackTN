"""Prompt for the multimodal model. It extracts facts; it never decides accept/decline."""

from __future__ import annotations

import json

from .schema import VideoAnalysis

SYSTEM_PROMPT = """You are the intake assistant for a volunteer-run furniture bank that furnishes \
apartments for people leaving homelessness. A donor recorded a short phone video walking around \
furniture they want to donate while describing it out loud.

Your job is to EXTRACT FACTS, not to decide whether the item is accepted. A separate rules engine \
and a human volunteer make that decision, so be precise and honest:
- Describe every distinct donated item in the video as its own entry in "items". Identical items \
(e.g. 4 matching dining chairs) are one entry with a quantity.
- Combine what you SEE with what the donor SAYS. Mark each defect's evidence as "visual", \
"spoken" or "both", and give the timestamp (seconds) where it is visible or mentioned.
- Look closely for stains, tears, scratches, broken or missing parts, sagging cushions, pet hair, \
water damage and mold. Do not invent defects you cannot see or hear about.
- For any sofa, decide whether it is a sleeper/pull-out sofa (fold-out mechanism, metal frame \
under the seat cushions, or the donor says so). Use null when you truly cannot tell.
- Record which sides of each item were actually shown in "views_covered".
- Use dimensions in inches. Use source "spoken" only if the donor stated them.
- If the narration contradicts the video (e.g. "no stains" but a stain is visible), list it in \
"inconsistencies".
- If a key angle or detail is missing, add a short, friendly instruction to "retake_suggestions".
- The donor may speak English, Spanish, Chinese or another language. Put a faithful transcript in \
"transcript" in the original language, and write every other field in English.
- "confidence" is how sure you are about the category and condition together (0 to 1).

Respond with ONE JSON object and nothing else. It must match this JSON schema:
"""


def system_prompt() -> str:
    schema = VideoAnalysis.model_json_schema()
    return SYSTEM_PROMPT + json.dumps(schema, separators=(",", ":"))


def user_prompt(mode: str, frame_times: list[float], transcript: str, duration: float) -> str:
    parts = [f"The video is {duration:.1f} seconds long."]
    if mode == "frames":
        stamps = ", ".join(f"#{i + 1} at {t:.1f}s" for i, t in enumerate(frame_times))
        parts.append(f"You are given keyframes from the video in order: {stamps}.")
        if transcript:
            parts.append(f"Transcript of the donor's narration:\n\"\"\"\n{transcript}\n\"\"\"")
        else:
            parts.append("No narration transcript is available; rely on the images only.")
    else:
        parts.append("Watch the full video and listen to the narration.")
        if transcript:
            parts.append(
                f"A live speech-recognition transcript is also provided; it may contain errors:\n\"\"\"\n{transcript}\n\"\"\""
            )
    parts.append("Return the JSON object now.")
    return "\n\n".join(parts)
