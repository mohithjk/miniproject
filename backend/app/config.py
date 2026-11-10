import os
from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application configuration loaded from environment variables or .env."""

    PROJECT_NAME: str = "AI Project Coordinator"
    ENVIRONMENT: str = "development"
    DEBUG: bool = True

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/ai_coordinator"

    # Security
    SECRET_KEY: str = "supersecretjwtkey_must_be_changed_in_prod_at_least_32_bytes"
    FERNET_KEY: str = "3DrM-CaUx0MNUkhT9A4YIqj6815bNjImM_rxdnkfa20="
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days

    # CORS Allowed Origins (comma-separated string in env)
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:5173,http://127.0.0.1:3000"

    # Webhook Base URL (used when registering GitHub webhooks)
    WEBHOOK_BASE_URL: str = "http://localhost:8000"

    # GitHub OAuth
    GITHUB_CLIENT_ID: str = ""
    GITHUB_CLIENT_SECRET: str = ""
    GITHUB_REDIRECT_URI: str = "http://localhost:8000/auth/github/callback"

    # Completion Scoring Thresholds (Core Rule 4)
    SCORE_PR_MERGED: float = 0.5
    SCORE_CI_PASSED: float = 0.2
    SCORE_FILES_EXIST: float = 0.15
    SCORE_JUDGE_WEIGHT: float = 0.15
    AUTO_COMPLETE_THRESHOLD: float = 0.8
    CONFIRM_THRESHOLD: float = 0.5

    # Job Worker Config (Core Rule 5)
    MAX_JOB_ATTEMPTS: int = 3
    JOB_POLL_INTERVAL_SECONDS: float = 2.0

    # Optional Chat Notification Webhooks (Discord / Slack)
    DISCORD_WEBHOOK_URL: Optional[str] = None
    SLACK_WEBHOOK_URL: Optional[str] = None

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
