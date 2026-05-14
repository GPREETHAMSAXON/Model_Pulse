import time
import threading
import requests
from typing import Any, Dict, List, Optional
from .config import get_config

# Thread-safe in-memory queue — predictions are buffered and flushed in batches
_queue: List[Dict] = []
_queue_lock = threading.Lock()
_flush_timer: Optional[threading.Timer] = None
_FLUSH_INTERVAL = 10  # seconds


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
            "model_id": config.model_id,
            "input_features": input_features,
            "prediction": prediction,
            "confidence": confidence,
            "latency_ms": latency_ms,
            "sdk_version": "0.1.0",
        }
        with _queue_lock:
            _queue.append(payload)
            if len(_queue) >= config.batch_size:
                _flush_sync()
            else:
                _schedule_flush()
    except Exception:
        pass  # SDK must never crash the user's application


def _schedule_flush() -> None:
    """Schedule a flush after FLUSH_INTERVAL if one isn't already scheduled."""
    global _flush_timer
    if _flush_timer is None or not _flush_timer.is_alive():
        _flush_timer = threading.Timer(_FLUSH_INTERVAL, _flush_background)
        _flush_timer.daemon = True
        _flush_timer.start()


def _flush_background() -> None:
    with _queue_lock:
        _flush_sync()


def _flush_sync() -> None:
    """Send queued predictions to the API. Must be called with _queue_lock held."""
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
                "Content-Type": "application/json",
            },
            timeout=config.timeout,
        )
    except Exception:
        pass  # silently drop on network failure — monitoring should not break production
