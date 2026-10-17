from datetime import date
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT_DIR / ".env", extra="ignore")

    anthropic_api_key: str = ""
    # Only needed when the API key is not scoped to a workspace (the API answers 400 and says so).
    anthropic_workspace_id: str = ""
    model: str = "claude-sonnet-5-5"
    mock_ai: bool = False
    cors_origins: str = "http://localhost:8443,http://localhost:3000,http://localhost:5173"
    demo_today: date | None = None

    # Demo-only access: the Kita code doubles as the staff password. Not real security.
    kita_code: str = "SONNE"
    kita_name: str = "Kita Sonnenblume"
    kita_city: str = "Berlin"
    staff_token: str = "demo-staff-token"

    data_dir: Path = ROOT_DIR / "data" / "kita-sonnenblume"
    prompts_dir: Path = ROOT_DIR / "prompts"
    db_path: Path = ROOT_DIR / "data" / "kita.db"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
