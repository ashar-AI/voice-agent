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
        "CAREVOICE_LIVE_MODEL", "gemini-live-2.5-flash-native-audio"
    )


settings = Settings()

