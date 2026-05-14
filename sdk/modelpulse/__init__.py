"""
ModelPulse Python SDK
---------------------
ML model monitoring for developers who just want to know if their model is broken.

Quickstart:
    pip install modelpulse

    import modelpulse

    modelpulse.init(
        api_key="mp_live_xxxx",
        model_id="your-model-uuid",
    )

    @modelpulse.monitor
    def predict(features: dict):
        return model.predict([features])[0]
"""

from .config import ModelPulseConfig, set_config
from .monitor import monitor


def init(api_key: str, model_id: str, **kwargs) -> None:
    """
    Initialise the ModelPulse SDK. Call this once at application startup.

    Args:
        api_key:  Your ModelPulse API key (from the dashboard → Settings → API Keys)
        model_id: The UUID of the model you want to monitor
        **kwargs: Optional overrides — api_url, timeout, batch_size, async_mode
    """
    config = ModelPulseConfig(api_key=api_key, model_id=model_id, **kwargs)
    set_config(config)


__all__ = ["init", "monitor"]
__version__ = "0.1.0"
