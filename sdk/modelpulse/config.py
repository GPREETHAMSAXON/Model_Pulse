import os
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class ModelPulseConfig:
    api_key: str
    model_id: str
    api_url: str = field(default_factory=lambda: os.getenv(
        "MODELPULSE_API_URL", "https://api.modelpulse.dev/api/v1"
    ))
    timeout: int = 5          # seconds — never slow down the model
    batch_size: int = 50      # predictions are batched before sending
    async_mode: bool = True   # fire-and-forget by default


# Global config instance — set once via modelpulse.init()
_config: Optional[ModelPulseConfig] = None


def get_config() -> ModelPulseConfig:
    if _config is None:
        raise RuntimeError(
            "ModelPulse not initialised. Call modelpulse.init(api_key=..., model_id=...) first."
        )
    return _config


def set_config(config: ModelPulseConfig) -> None:
    global _config
    _config = config
