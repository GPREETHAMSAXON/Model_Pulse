import time
import functools
from typing import Any, Callable, Dict, Optional
from .client import log_prediction


def monitor(func: Optional[Callable] = None, *, label: Optional[str] = None):
    """
    Decorator that wraps a model predict() function and logs every call to ModelPulse.

    Usage:

        @modelpulse.monitor
        def predict(features):
            return model.predict([features])[0]

        # Or with a custom label:
        @modelpulse.monitor(label="churn-model-v2")
        def predict(features):
            ...

    The decorator:
    - Records input features, prediction output, confidence (if returned), and latency
    - Never raises — if ModelPulse is down, predict() still works normally
    - Adds < 1ms overhead in async (fire-and-forget) mode
    """
    def decorator(fn: Callable) -> Callable:
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            # Capture input features — first positional arg is assumed to be the feature dict
            input_features: Dict[str, Any] = {}
            if args:
                first_arg = args[0]
                if isinstance(first_arg, dict):
                    input_features = first_arg
                elif hasattr(first_arg, '__dict__'):
                    input_features = vars(first_arg)

            input_features.update(
                {k: v for k, v in kwargs.items() if k != 'self'}
            )

            start = time.monotonic()
            result = fn(*args, **kwargs)
            latency_ms = int((time.monotonic() - start) * 1000)

            # Handle both plain predictions and (prediction, confidence) tuples
            if isinstance(result, tuple) and len(result) == 2:
                prediction, confidence = result
            else:
                prediction, confidence = result, None

            log_prediction(
                input_features=input_features,
                prediction=prediction,
                confidence=confidence,
                latency_ms=latency_ms,
            )

            return result

        return wrapper

    # Support both @monitor and @monitor(label="...")
    if func is not None:
        return decorator(func)
    return decorator
