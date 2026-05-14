import time
import threading
import requests
from typing import Any, Dict, List, Optional
from .config import get_config

# ── Prediction queue
_queue: List[Dict] = []
_queue_lock = threading.Lock()
_flush_timer: Optional[threading.Timer] = None

# ── LLM call queue
_llm_queue: List[Dict] = []
_llm_queue_lock = threading.Lock()
_llm_flush_timer: Optional[threading.Timer] = None

_FLUSH_INTERVAL = 10  # seconds


# ─────────────────────────────────────────────
# PREDICTION LOGGING
# ─────────────────────────────────────────────

def log_prediction(
    input_features: Dict[str, Any],
    prediction: Any,
    confidence: Optional[float] = None,
    latency_ms: Optional[int] = None,
) -> None:
    """Add a prediction to the outbound queue. Thread-safe. Never raises."""
    try:
        config = get_config()
        payload = {
            "model_id":       config.model_id,
            "input_features": input_features,
            "prediction":     prediction,
            "confidence":     confidence,
            "latency_ms":     latency_ms,
            "sdk_version":    "0.1.1",
        }
        with _queue_lock:
            _queue.append(payload)
            if len(_queue) >= config.batch_size:
                _flush_sync()
            else:
                _schedule_flush()
    except Exception:
        pass


def _schedule_flush() -> None:
    global _flush_timer
    if _flush_timer is None or not _flush_timer.is_alive():
        _flush_timer = threading.Timer(_FLUSH_INTERVAL, _flush_background)
        _flush_timer.daemon = True
        _flush_timer.start()


def _flush_background() -> None:
    with _queue_lock:
        _flush_sync()


def _flush_sync() -> None:
    global _queue
    if not _queue:
        return
    batch = _queue[:]
    _queue = []
    try:
        config = get_config()
        requests.post(
            f"{config.api_url}/predictions/batch",
            json={"predictions": batch},
            headers={
                "Authorization": f"Bearer {config.api_key}",
                "Content-Type":  "application/json",
            },
            timeout=config.timeout,
        )
    except Exception:
        pass


# ─────────────────────────────────────────────
# LLM CALL LOGGING
# ─────────────────────────────────────────────

def _queue_llm_call(call: Dict) -> None:
    """Add an LLM call to the outbound queue. Thread-safe. Never raises."""
    try:
        with _llm_queue_lock:
            _llm_queue.append(call)
            if len(_llm_queue) >= 20:
                _llm_flush_sync()
            else:
                _llm_schedule_flush()
    except Exception:
        pass


def _llm_schedule_flush() -> None:
    global _llm_flush_timer
    if _llm_flush_timer is None or not _llm_flush_timer.is_alive():
        _llm_flush_timer = threading.Timer(_FLUSH_INTERVAL, _llm_flush_background)
        _llm_flush_timer.daemon = True
        _llm_flush_timer.start()


def _llm_flush_background() -> None:
    with _llm_queue_lock:
        _llm_flush_sync()


def _llm_flush_sync() -> None:
    global _llm_queue
    if not _llm_queue:
        return
    batch = _llm_queue[:]
    _llm_queue = []
    try:
        config = get_config()
        requests.post(
            f"{config.api_url}/llm/batch",
            json={"calls": batch},
            headers={
                "Authorization": f"Bearer {config.api_key}",
                "Content-Type":  "application/json",
            },
            timeout=config.timeout,
        )
    except Exception:
        pass


def flush() -> None:
    """Flush all queued predictions and LLM calls immediately."""
    with _queue_lock:
        _flush_sync()
    with _llm_queue_lock:
        _llm_flush_sync()
