# modelpulse-sdk

> ML model monitoring for developers. One decorator. Live drift detection, AI diagnosis, and instant alerts — in 60 seconds.

[![PyPI version](https://badge.fury.io/py/modelpulse-sdk.svg)](https://pypi.org/project/modelpulse-sdk/)
[![Python](https://img.shields.io/badge/Python-3.8%2B-blue)](https://pypi.org/project/modelpulse-sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

---

## What is ModelPulse?

ModelPulse monitors your ML models in production. It detects when your model's input data starts looking different from what it was trained on (data drift), generates AI-powered plain-English explanations of what changed, and fires Slack/email alerts — automatically.

**No MLOps team required. No schema design. No enterprise sales call.**

---

## Installation

```bash
pip install modelpulse-sdk
```

---

## Quickstart

```python
import modelpulse

# Initialize once at startup
modelpulse.init(
    api_key="mp_live_xxxx",       # from dashboard → model → API Keys
    model_id="your-model-uuid",   # from dashboard
)

# Wrap your predict function with one decorator
@modelpulse.monitor
def predict(features: dict):
    return my_model.predict([features])[0]

# That's it — ModelPulse logs every prediction automatically
result = predict({"age": 34, "income": 72000, "tenure_months": 12})
```

ModelPulse will:
- Log every prediction (inputs, outputs, confidence, latency)
- Compute drift hourly against your baseline distribution
- Generate an AI diagnosis when drift is detected
- Fire Slack/email alerts with the diagnosis included

---

## How it works

### 1. Batching
Predictions are queued in memory and flushed every 10 seconds or when 50 accumulate — whichever comes first. This means zero blocking on your model's critical path.

### 2. Non-blocking
The SDK uses a background thread. Your `predict()` function adds less than 1ms overhead.

### 3. Resilient
Network failures are silently dropped. The SDK **never** raises an exception that could crash your application.

---

## Advanced usage

### Return confidence scores

```python
@modelpulse.monitor
def predict(features: dict):
    probs = model.predict_proba([features])[0]
    # Return (prediction, confidence) tuple
    return probs.argmax(), float(probs.max())
```

### Custom API URL (self-hosted)

```python
modelpulse.init(
    api_key="mp_live_xxxx",
    model_id="your-model-uuid",
    api_url="https://your-own-api.com/api/v1",
)
```

### Works with any framework

```python
# scikit-learn
@modelpulse.monitor
def predict(features):
    return sklearn_model.predict([list(features.values())])[0]

# XGBoost
@modelpulse.monitor
def predict(features):
    dmatrix = xgb.DMatrix([list(features.values())])
    return float(xgb_model.predict(dmatrix)[0])

# PyTorch
@modelpulse.monitor
def predict(features):
    tensor = torch.tensor(list(features.values()))
    return torch_model(tensor).item()
```

---

## Drift Detection

ModelPulse uses two statistical tests under the hood:

| Test | What it measures |
|---|---|
| **PSI** (Population Stability Index) | Magnitude of distribution shift |
| **KS Test** (Kolmogorov-Smirnov) | Whether two distributions are different |

| PSI Score | Health Status |
|---|---|
| < 0.10 | 🟢 Healthy — no significant drift |
| 0.10 – 0.20 | 🟡 Warning — moderate drift |
| > 0.20 | 🔴 Critical — significant drift |

You never need to configure these thresholds manually — ModelPulse computes them automatically from your first 100 predictions.

---

## Dashboard

After integrating the SDK, view your model's health at:

👉 **[https://frontend-ruddy-sigma-92.vercel.app](https://frontend-ruddy-sigma-92.vercel.app)**

The dashboard shows:
- Feature drift scores with visual progress bars
- AI-generated plain-English diagnosis (powered by Claude)
- Prediction volume and latency trends
- Alert history

---

## Configuration options

```python
modelpulse.init(
    api_key="mp_live_xxxx",      # required — your API key
    model_id="uuid",             # required — your model ID
    api_url="https://...",       # optional — default: ModelPulse cloud
    timeout=5,                   # optional — HTTP timeout in seconds
    batch_size=50,               # optional — flush after N predictions
    async_mode=True,             # optional — fire-and-forget mode
)
```

---

## Links

- 🌐 **Website:** [https://landing-kappa-lilac.vercel.app](https://landing-kappa-lilac.vercel.app)
- 📊 **Dashboard:** [https://frontend-ruddy-sigma-92.vercel.app](https://frontend-ruddy-sigma-92.vercel.app)
- 📁 **GitHub:** [https://github.com/GPREETHAMSAXON/Model_Pulse](https://github.com/GPREETHAMSAXON/Model_Pulse)
- 🐛 **Issues:** [https://github.com/GPREETHAMSAXON/Model_Pulse/issues](https://github.com/GPREETHAMSAXON/Model_Pulse/issues)

---

## License

MIT License — see [LICENSE](https://github.com/GPREETHAMSAXON/Model_Pulse/blob/main/LICENSE) for details.

---

Built by **Saxon Preetham** · Visakhapatnam, India · 2026
