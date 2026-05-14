"""
ModelPulse LLM Monitor
======================
Wraps any LLM call and automatically logs:
  - Provider, model name
  - Prompt & completion (optional)
  - Token usage and cost
  - Latency and TTFT
  - Quality scores and user feedback

Usage:
    import modelpulse
    modelpulse.init(api_key="mp_live_...", model_id="...")

    # Option 1: Decorator
    @modelpulse.monitor_llm(provider="openai", llm_model="gpt-4o")
    def chat(prompt):
        return openai_client.chat.completions.create(...)

    # Option 2: Context manager
    with modelpulse.LlmSpan(provider="anthropic", llm_model="claude-3-5-sonnet") as span:
        response = anthropic_client.messages.create(...)
        span.set_completion(response.content[0].text)
        span.set_tokens(response.usage.input_tokens, response.usage.output_tokens)

    # Option 3: Manual logging
    modelpulse.log_llm_call(
        provider="openai",
        llm_model="gpt-4o-mini",
        prompt="Summarize this document...",
        completion="Here is a summary...",
        prompt_tokens=120,
        completion_tokens=80,
        cost_usd=0.000042,
        latency_ms=843,
    )
"""

import time
import functools
from typing import Optional, List
from .client import _queue_llm_call, flush


def monitor_llm(
    provider: str = "unknown",
    llm_model: str = None,
    store_prompt: bool = False,
    store_completion: bool = False,
    cost_per_1k_input: float = None,
    cost_per_1k_output: float = None,
    tags: List[str] = None,
):
    """
    Decorator that wraps an LLM call function and automatically logs
    timing, token usage, and outputs to ModelPulse.

    The wrapped function must return an object with these optional attributes:
      - .choices[0].message.content  (OpenAI style)
      - .content[0].text             (Anthropic style)
      - .usage.prompt_tokens         (OpenAI)
      - .usage.input_tokens          (Anthropic)
      - .usage.completion_tokens / .output_tokens
    """
    def decorator(fn):
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            start_ms = time.time() * 1000
            error_msg = None
            response = None

            try:
                response = fn(*args, **kwargs)
                return response
            except Exception as e:
                error_msg = str(e)
                raise
            finally:
                latency_ms = int(time.time() * 1000 - start_ms)

                # Extract from response
                completion_text = None
                prompt_tokens   = None
                compl_tokens    = None

                if response is not None:
                    # OpenAI style
                    try:
                        completion_text = response.choices[0].message.content
                        prompt_tokens   = response.usage.prompt_tokens
                        compl_tokens    = response.usage.completion_tokens
                    except AttributeError:
                        pass

                    # Anthropic style
                    if completion_text is None:
                        try:
                            completion_text = response.content[0].text
                            prompt_tokens   = response.usage.input_tokens
                            compl_tokens    = response.usage.output_tokens
                        except AttributeError:
                            pass

                # Compute cost
                cost_usd = None
                if cost_per_1k_input and cost_per_1k_output and prompt_tokens and compl_tokens:
                    cost_usd = (prompt_tokens / 1000 * cost_per_1k_input +
                                compl_tokens  / 1000 * cost_per_1k_output)

                # Get prompt from args if possible
                prompt = None
                if args and isinstance(args[0], str):
                    prompt = args[0]
                elif kwargs.get("prompt"):
                    prompt = kwargs["prompt"]

                _queue_llm_call({
                    "provider":          provider,
                    "llm_model":         llm_model,
                    "prompt":            prompt if store_prompt else None,
                    "completion":        completion_text if store_completion else None,
                    "store_prompt":      store_prompt,
                    "store_completion":  store_completion,
                    "prompt_tokens":     prompt_tokens,
                    "completion_tokens": compl_tokens,
                    "cost_usd":          round(cost_usd, 8) if cost_usd else None,
                    "latency_ms":        latency_ms,
                    "tags":              tags or [],
                    "error":             error_msg,
                })
        return wrapper
    return decorator


class LlmSpan:
    """
    Context manager for manual LLM call tracing.

    with modelpulse.LlmSpan(provider="anthropic", llm_model="claude-3-5-sonnet") as span:
        response = client.messages.create(...)
        span.set_completion(response.content[0].text)
        span.set_tokens(response.usage.input_tokens, response.usage.output_tokens)
        span.set_cost(0.000045)
    """

    def __init__(
        self,
        provider: str = "unknown",
        llm_model: str = None,
        prompt: str = None,
        system_prompt: str = None,
        store_prompt: bool = False,
        store_completion: bool = False,
        tags: List[str] = None,
        session_id: str = None,
    ):
        self.provider          = provider
        self.llm_model         = llm_model
        self.prompt            = prompt
        self.system_prompt     = system_prompt
        self.store_prompt      = store_prompt
        self.store_completion  = store_completion
        self.tags              = tags or []
        self.session_id        = session_id
        self._start_ms         = None
        self._completion       = None
        self._prompt_tokens    = None
        self._compl_tokens     = None
        self._cost_usd         = None
        self._quality_score    = None
        self._thumbs_up        = None
        self._hallucination    = None
        self._ttft_ms          = None
        self._error            = None

    def __enter__(self):
        self._start_ms = time.time() * 1000
        return self

    def set_completion(self, text: str):
        self._completion = text

    def set_tokens(self, prompt_tokens: int, completion_tokens: int):
        self._prompt_tokens = prompt_tokens
        self._compl_tokens  = completion_tokens

    def set_cost(self, cost_usd: float):
        self._cost_usd = cost_usd

    def set_quality(self, score: float):
        """Score between 0 and 1."""
        self._quality_score = max(0.0, min(1.0, score))

    def set_feedback(self, thumbs_up: bool):
        self._thumbs_up = thumbs_up

    def flag_hallucination(self):
        self._hallucination = True

    def set_ttft(self, ttft_ms: int):
        self._ttft_ms = ttft_ms

    def set_error(self, error: str):
        self._error = error

    def __exit__(self, exc_type, exc_val, exc_tb):
        latency_ms = int(time.time() * 1000 - self._start_ms)
        if exc_val:
            self._error = str(exc_val)

        _queue_llm_call({
            "provider":          self.provider,
            "llm_model":         self.llm_model,
            "prompt":            self.prompt if self.store_prompt else None,
            "completion":        self._completion if self.store_completion else None,
            "system_prompt":     self.system_prompt,
            "store_prompt":      self.store_prompt,
            "store_completion":  self.store_completion,
            "prompt_tokens":     self._prompt_tokens,
            "completion_tokens": self._compl_tokens,
            "cost_usd":          self._cost_usd,
            "latency_ms":        latency_ms,
            "ttft_ms":           self._ttft_ms,
            "quality_score":     self._quality_score,
            "thumbs_up":         self._thumbs_up,
            "hallucination":     self._hallucination or False,
            "tags":              self.tags,
            "session_id":        self.session_id,
            "error":             self._error,
        })
        return False  # Don't suppress exceptions


def log_llm_call(
    provider: str = "unknown",
    llm_model: str = None,
    prompt: str = None,
    completion: str = None,
    prompt_tokens: int = None,
    completion_tokens: int = None,
    cost_usd: float = None,
    latency_ms: int = None,
    quality_score: float = None,
    thumbs_up: bool = None,
    hallucination: bool = False,
    tags: List[str] = None,
    session_id: str = None,
    store_prompt: bool = False,
    store_completion: bool = False,
):
    """
    Manual one-shot LLM call logger.
    Use this when you can't use the decorator or context manager.
    """
    _queue_llm_call({
        "provider":          provider,
        "llm_model":         llm_model,
        "prompt":            prompt if store_prompt else None,
        "completion":        completion if store_completion else None,
        "store_prompt":      store_prompt,
        "store_completion":  store_completion,
        "prompt_tokens":     prompt_tokens,
        "completion_tokens": completion_tokens,
        "cost_usd":          cost_usd,
        "latency_ms":        latency_ms,
        "quality_score":     quality_score,
        "thumbs_up":         thumbs_up,
        "hallucination":     hallucination or False,
        "tags":              tags or [],
        "session_id":        session_id,
        "error":             None,
    })
