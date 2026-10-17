"""Multimodal model backends.

- OCIProvider: OCI Generative AI chat. In "video" mode the whole clip (with audio) goes to a
  video-capable model such as google.gemini-2.5-flash; in "frames" mode keyframes go to an
  image model such as meta.llama-4-maverick, with a transcript in the prompt.
- OpenAIProvider: any OpenAI-compatible endpoint, frames mode.
- MockProvider: canned answers so the demo runs with no cloud credentials.
"""

from __future__ import annotations

import base64
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

import httpx
from pydantic import ValidationError

from .config import Settings
from .prompts import system_prompt, user_prompt
from .schema import VideoAnalysis
from .video import Frame


@dataclass
class ModelInput:
    mode: str  # "video" | "frames"
    frames: list[Frame]
    duration: float
    transcript: str = ""
    model_video: Path | None = None  # small mp4 for video mode
    contact_sheet: Path | None = None  # single tiled image for one-image models


class Provider(Protocol):
    name: str
    model: str

    def analyze(self, inp: ModelInput) -> VideoAnalysis: ...


class ModelOutputError(RuntimeError):
    pass


def _data_url(path: Path, mime: str) -> str:
    return f"data:{mime};base64,{base64.b64encode(path.read_bytes()).decode()}"


def parse_analysis(text: str) -> VideoAnalysis:
    """Pull the JSON object out of a model reply (tolerates ```json fences and chatter)."""
    fenced = re.search(r"```(?:json)?\s*(\{.*\})\s*```", text, re.S)
    body = fenced.group(1) if fenced else text[text.find("{"): text.rfind("}") + 1]
    if not body:
        raise ModelOutputError(f"Model did not return JSON: {text[:300]}")
    try:
        return VideoAnalysis.model_validate(json.loads(body))
    except (json.JSONDecodeError, ValidationError) as e:
        raise ModelOutputError(f"Model returned invalid JSON: {e}") from e


def _with_retry(call, attempts: int = 2) -> VideoAnalysis:
    err: Exception | None = None
    for _ in range(attempts):
        try:
            return parse_analysis(call())
        except ModelOutputError as e:
            err = e
    raise err  # type: ignore[misc]


class OCIProvider:
    name = "oci"

    def __init__(self, s: Settings):
        import oci  # imported lazily so mock mode needs no OCI config

        self.s = s
        self.model = s.oci_model_id
        self.m = oci.generative_ai_inference.models
        config = oci.config.from_file(s.oci_config_file, s.oci_profile)
        self.client = oci.generative_ai_inference.GenerativeAiInferenceClient(
            config, service_endpoint=s.oci_endpoint, timeout=(10, 240)
        )
        if not s.oci_compartment_id:
            raise RuntimeError("OCI_COMPARTMENT_ID is required for the OCI provider.")

    def _content(self, inp: ModelInput) -> list:
        m = self.m
        prompt = user_prompt(inp.mode, [f.t for f in inp.frames], inp.transcript, inp.duration)
        content: list = [m.TextContent(text=prompt)]
        if inp.mode == "video" and inp.model_video:
            content.append(m.VideoContent(video_url=m.VideoUrl(url=_data_url(inp.model_video, "video/mp4"))))
        elif inp.contact_sheet:
            content.append(m.ImageContent(image_url=m.ImageUrl(url=_data_url(inp.contact_sheet, "image/jpeg"))))
        else:
            for f in inp.frames:
                content.append(m.ImageContent(image_url=m.ImageUrl(url=_data_url(f.path, "image/jpeg"))))
        return content

    def analyze(self, inp: ModelInput) -> VideoAnalysis:
        m = self.m
        request = m.GenericChatRequest(
            api_format=m.BaseChatRequest.API_FORMAT_GENERIC,
            messages=[
                m.SystemMessage(content=[m.TextContent(text=system_prompt())]),
                m.UserMessage(content=self._content(inp)),
            ],
            temperature=0.1,
            max_tokens=4000,
        )
        details = m.ChatDetails(
            compartment_id=self.s.oci_compartment_id,
            serving_mode=m.OnDemandServingMode(model_id=self.s.oci_model_id),
            chat_request=request,
        )

        def call() -> str:
            resp = self.client.chat(details)
            parts = resp.data.chat_response.choices[0].message.content or []
            return "".join(getattr(p, "text", "") or "" for p in parts)

        return _with_retry(call)


class OpenAIProvider:
    name = "openai"

    def __init__(self, s: Settings):
        if not s.openai_api_key:
            raise RuntimeError("OPENAI_API_KEY is required for the openai provider.")
        self.s = s
        self.model = s.openai_model

    def analyze(self, inp: ModelInput) -> VideoAnalysis:
        prompt = user_prompt("frames", [f.t for f in inp.frames], inp.transcript, inp.duration)
        content: list[dict] = [{"type": "text", "text": prompt}]
        for f in inp.frames:
            content.append({"type": "image_url", "image_url": {"url": _data_url(f.path, "image/jpeg")}})
        payload = {
            "model": self.s.openai_model,
            "temperature": 0.1,
            "response_format": {"type": "json_object"},
            "messages": [
                {"role": "system", "content": system_prompt()},
                {"role": "user", "content": content},
            ],
        }

        def call() -> str:
            r = httpx.post(
                f"{self.s.openai_base_url.rstrip('/')}/chat/completions",
                headers={"Authorization": f"Bearer {self.s.openai_api_key}"},
                json=payload, timeout=240,
            )
            r.raise_for_status()
            return r.json()["choices"][0]["message"]["content"]

        return _with_retry(call)


class MockProvider:
    """Keyword-driven canned results. Say "sleeper", "stain", "dresser" or "table" in the
    narration (or the file name) to see the different outcomes in a demo without OCI."""

    name = "mock"
    model = "canned"

    def analyze(self, inp: ModelInput) -> VideoAnalysis:
        text = inp.transcript.lower()
        times = [f.t for f in inp.frames] or [0.0]
        mid = times[len(times) // 2]
        all_views = ["front", "left", "back", "right", "cushions"]

        def has(*words: str) -> bool:
            return any(w in text for w in words)

        if has("sleeper", "pull-out", "pull out", "沙发床"):
            item = {
                "title": "Beige sleeper sofa with pull-out bed", "category": "sleeper_sofa", "room": "living_room",
                "material": "microfiber", "color": "beige", "age_years": 6, "condition_grade": "good",
                "condition_score": 4, "is_sleeper": True, "views_covered": all_views, "best_view_s": times[0],
                "dimensions": {"width_in": 84, "depth_in": 36, "height_in": 34, "source": "estimated"},
                "evidence": "Metal fold-out mechanism visible when cushions are lifted; donor calls it a pull-out.",
                "confidence": 0.9,
            }
        elif has("stain", "污", "dirty"):
            item = {
                "title": "Blue upholstered armchair", "category": "armchair", "room": "living_room",
                "material": "fabric", "color": "navy blue", "age_years": 8, "condition_grade": "fair",
                "condition_score": 2, "is_sleeper": False, "views_covered": ["front", "left", "right"],
                "best_view_s": times[0],
                "defects": [{"type": "stain", "severity": "moderate", "location": "seat cushion, center",
                             "evidence": "both", "timestamp_s": mid, "note": "Dark ring about 4 inches wide."}],
                "evidence": "Single upholstered seat with arms; stain visible on the seat.", "confidence": 0.85,
            }
        elif has("dresser", "柜", "drawer"):
            item = {
                "title": "Oak 6-drawer dresser", "category": "dresser", "room": "bedroom",
                "material": "solid oak", "color": "honey oak", "age_years": 4, "condition_grade": "good",
                "condition_score": 4, "views_covered": ["front", "left", "right", "top"], "best_view_s": times[0],
                "dimensions": {"width_in": 60, "depth_in": 18, "height_in": 32, "source": "spoken"},
                "defects": [{"type": "scratch", "severity": "minor", "location": "top surface",
                             "evidence": "visual", "timestamp_s": mid}],
                "evidence": "Six drawers open and close smoothly on camera.", "confidence": 0.92,
            }
        elif has("table", "chair", "桌", "椅"):
            item = {
                "title": "Wood dining table", "category": "dining_table", "room": "dining",
                "material": "wood", "color": "espresso", "condition_grade": "good", "condition_score": 4,
                "views_covered": ["front", "top", "left", "right"], "best_view_s": times[0],
                "evidence": "Rectangular four-leg table.", "confidence": 0.88,
            }
            chairs = {
                "title": "Matching dining chairs", "category": "dining_chair", "room": "dining", "quantity": 4,
                "material": "wood", "color": "espresso", "condition_grade": "good", "condition_score": 4,
                "views_covered": ["front", "back", "left"], "best_view_s": times[-1],
                "evidence": "Four identical chairs shown together.", "confidence": 0.86,
            }
            return VideoAnalysis.model_validate({
                "items": [item, chairs], "transcript": inp.transcript,
                "narration_summary": "Dining table with four chairs, good condition.",
            })
        else:
            item = {
                "title": "Gray 3-seat fabric sofa", "category": "sofa", "room": "living_room",
                "material": "polyester fabric", "color": "light gray", "age_years": 3, "condition_grade": "good",
                "condition_score": 4, "is_sleeper": False, "views_covered": all_views, "best_view_s": times[0],
                "dimensions": {"width_in": 82, "depth_in": 35, "height_in": 33, "source": "estimated"},
                "evidence": "Three seat cushions, fixed base visible with cushions removed.", "confidence": 0.9,
            }
        return VideoAnalysis.model_validate({
            "items": [item],
            "donor_context": {"pets_in_home": has("cat", "dog", "pet", "猫", "狗"), "smoking_home": False},
            "transcript": inp.transcript,
            "narration_summary": "(mock) " + (inp.transcript[:160] or "No narration provided."),
        })


def get_provider(s: Settings) -> Provider:
    if s.vision_provider == "oci":
        return OCIProvider(s)
    if s.vision_provider == "openai":
        return OpenAIProvider(s)
    return MockProvider()


def transcribe(audio: Path, s: Settings) -> str:
    """Speech-to-text for frames mode. Video mode lets the model listen directly instead."""
    if s.transcribe_provider != "openai" or not s.openai_api_key:
        return ""
    with audio.open("rb") as fh:
        r = httpx.post(
            f"{s.openai_base_url.rstrip('/')}/audio/transcriptions",
            headers={"Authorization": f"Bearer {s.openai_api_key}"},
            data={"model": s.transcribe_model},
            files={"file": (audio.name, fh, "audio/wav")},
            timeout=120,
        )
    r.raise_for_status()
    return r.json().get("text", "")
