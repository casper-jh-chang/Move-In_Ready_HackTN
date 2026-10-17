"""Runtime settings, read from environment variables (see backend/.env.example)."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent


def _load_dotenv(path: Path) -> None:
    """Minimal .env loader so the demo needs no extra dependency."""
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_dotenv(BACKEND_DIR / ".env")


def _env(name: str, default: str = "") -> str:
    return os.environ.get(name, default).strip()


@dataclass
class Settings:
    # mock | ollama | oci | openai
    vision_provider: str = field(default_factory=lambda: _env("VISION_PROVIDER", "mock"))
    # video: send the whole clip (audio included) to a model that understands video, e.g. Gemini on OCI.
    # frames: send sharp keyframes + a transcript, for image-only models such as Llama 4 on OCI.
    input_mode: str = field(default_factory=lambda: _env("INPUT_MODE", "video"))

    # OCI Generative AI
    oci_config_file: str = field(default_factory=lambda: _env("OCI_CONFIG_FILE", "~/.oci/config"))
    oci_profile: str = field(default_factory=lambda: _env("OCI_PROFILE", "DEFAULT"))
    oci_compartment_id: str = field(default_factory=lambda: _env("OCI_COMPARTMENT_ID"))
    oci_endpoint: str = field(
        default_factory=lambda: _env(
            "OCI_GENAI_ENDPOINT", "https://inference.generativeai.us-chicago-1.oci.oraclecloud.com"
        )
    )
    oci_model_id: str = field(default_factory=lambda: _env("OCI_MODEL_ID", "google.gemini-2.5-flash"))

    # Any OpenAI-compatible endpoint (also used for Whisper-style transcription in frames mode)
    openai_base_url: str = field(default_factory=lambda: _env("OPENAI_BASE_URL", "https://api.openai.com/v1"))
    openai_api_key: str = field(default_factory=lambda: _env("OPENAI_API_KEY"))
    openai_model: str = field(default_factory=lambda: _env("OPENAI_MODEL", "gpt-4o-mini"))
    transcribe_provider: str = field(default_factory=lambda: _env("TRANSCRIBE_PROVIDER", "none"))
    transcribe_model: str = field(default_factory=lambda: _env("TRANSCRIBE_MODEL", "whisper-1"))

    # Local models: Ollama for vision, faster-whisper for speech
    ollama_base_url: str = field(default_factory=lambda: _env("OLLAMA_BASE_URL", "http://localhost:11434"))
    ollama_model: str = field(default_factory=lambda: _env("OLLAMA_MODEL", "qwen2.5vl:7b"))
    ollama_image_px: int = field(default_factory=lambda: int(_env("OLLAMA_IMAGE_PX", "672")))
    ollama_num_ctx: int = field(default_factory=lambda: int(_env("OLLAMA_NUM_CTX", "16384")))
    ollama_timeout_s: int = field(default_factory=lambda: int(_env("OLLAMA_TIMEOUT_S", "600")))
    whisper_model_size: str = field(default_factory=lambda: _env("WHISPER_MODEL_SIZE", "small"))
    frames_as_sheet: bool = field(default_factory=lambda: _env("FRAMES_AS_SHEET", "false").lower() == "true")

    # Pipeline knobs
    num_keyframes: int = field(default_factory=lambda: int(_env("NUM_KEYFRAMES", "8")))
    max_video_seconds: int = field(default_factory=lambda: int(_env("MAX_VIDEO_SECONDS", "120")))
    max_upload_mb: int = field(default_factory=lambda: int(_env("MAX_UPLOAD_MB", "200")))
    rules_file: Path = field(
        default_factory=lambda: Path(_env("RULES_FILE", str(BACKEND_DIR / "rules" / "house2home.json")))
    )
    data_dir: Path = field(default_factory=lambda: Path(_env("DATA_DIR", str(BACKEND_DIR / "data"))))

    @property
    def media_dir(self) -> Path:
        return self.data_dir / "media"

    @property
    def db_path(self) -> Path:
        return self.data_dir / "inventory.sqlite3"


settings = Settings()
