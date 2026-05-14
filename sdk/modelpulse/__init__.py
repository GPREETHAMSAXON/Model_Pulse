"""
ModelPulse Python SDK
---------------------
ML model monitoring + LLM observability for developers.

Quickstart — Traditional ML:
    import modelpulse
    modelpulse.init(api_key="mp_live_...", model_id="your-uuid")

    @modelpulse.monitor
    def predict(features: dict):
        return model.predict([features])[0]

Quickstart — LLM Monitoring:
    import modelpulse
    modelpulse.init(api_key="mp_live_...", model_id="your-uuid")

    # Option 1: Context manager (recommended)
    with modelpulse.LlmSpan(provider="openai", llm_model="gpt-4o") as span:
        response = openai_client.chat.completions.create(...)
        span.set_tokens(response.usage.prompt_tokens, response.usage.completion_tokens)
        span.set_cost(0.000045)

    # Option 2: Decorator
    @modelpulse.monitor_llm(provider="anthropic", llm_model="claude-3-5-sonnet")
    def call_llm(prompt):
        return anthropic_client.messages.create(...)

    # Option 3: Manual
    modelpulse.log_llm_call(
        provider="openai", llm_model="gpt-4o-mini",
        prompt_tokens=120, completion_tokens=80,
        cost_usd=0.000042, latency_ms=843,
    )
"""

from .config  import ModelPulseConfig, set_config
from .monitor import monitor
from .llm     import monitor_llm, LlmSpan, log_llm_call
from .client  import flush


def init(api_key: str, model_id: str, **kwargs) -> None:
    """
    Initialise the ModelPulse SDK. Call once at application startup.

    Args:
        api_key:  Your ModelPulse API key (from dashboard → model → API Keys)
        model_id: UUID of the model to monitor
        **kwargs: api_url, timeout, batch_size
    """
    config = ModelPulseConfig(api_key=api_key, model_id=model_id, **kwargs)
    set_config(config)


__all__ = ["init", "monitor", "monitor_llm", "LlmSpan", "log_llm_call", "flush"]
__version__ = "0.2.0"
