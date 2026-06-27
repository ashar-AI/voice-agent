"""Runtime configuration for the CareVoice ADK service."""

from dataclasses import dataclass
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")


@dataclass(frozen=True)
class Settings:
    app_name: str = os.getenv("CAREVOICE_ADK_APP_NAME", "carevoice-voice-agent")
    carevoice_api_base_url: str = os.getenv(
        "CAREVOICE_API_BASE_URL", "http://localhost:8090"
    ).rstrip("/")
    elder_id: str = os.getenv("CAREVOICE_ELDER_ID", "sato_001")
    live_model: str = os.getenv(
        "CAREVOICE_LIVE_MODEL", "gemini-3.1-flash-live-preview"
    )
    use_vertex: bool = os.getenv("GOOGLE_GENAI_USE_VERTEXAI", "false").lower() == "true"
    vertex_location: str = os.getenv("CAREVOICE_VERTEX_LOCATION", "us-central1")
    api_key: str | None = (
        os.getenv("GOOGLE_API_KEY")
        or os.getenv("GEMINI_API_KEY")
        or os.getenv("CAREVOICE_GEMINI_API_KEY")
    )


settings = Settings()

if settings.use_vertex:
    os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "true"
    os.environ["GOOGLE_CLOUD_LOCATION"] = settings.vertex_location
else:
    os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "false"
    if settings.api_key:
        os.environ.setdefault("GOOGLE_API_KEY", settings.api_key)
