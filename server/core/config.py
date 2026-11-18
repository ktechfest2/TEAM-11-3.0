"""Application configuration, loaded from environment variables (prefix AWAVOTE_)."""
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

SERVER_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="AWAVOTE_", env_file=".env", extra="ignore")

    app_name: str = "AwaVote API"
    environment: str = "development"
    database_url: str = f"sqlite:///{SERVER_DIR / 'awavote.db'}"
    storage_dir: Path = SERVER_DIR / "storage"
    # Converted on-device speech models (see ai/speech_to_text/convert_natlas.py), served at /models/.
    models_dir: Path = SERVER_DIR / "data" / "models"
    # Origins allowed to call the API from a browser (the PWA).
    cors_origins: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]
    max_upload_bytes: int = 15 * 1024 * 1024
    rate_limit_per_minute: int = 120
    # Secret used for HMAC signing of server receipts. MUST be overridden in production.
    receipt_secret: str = "dev-only-change-me"


@lru_cache
def get_settings() -> Settings:
    return Settings()
