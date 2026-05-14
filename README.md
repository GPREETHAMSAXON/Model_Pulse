<div align="center">

<br/>

```
███╗   ███╗ ██████╗ ██████╗ ███████╗██╗     ██████╗ ██╗   ██╗██╗     ███████╗███████╗
████╗ ████║██╔═══██╗██╔══██╗██╔════╝██║     ██╔══██╗██║   ██║██║     ██╔════╝██╔════╝
██╔████╔██║██║   ██║██║  ██║█████╗  ██║     ██████╔╝██║   ██║██║     ███████╗█████╗  
██║╚██╔╝██║██║   ██║██║  ██║██╔══╝  ██║     ██╔═══╝ ██║   ██║██║     ╚════██║██╔══╝  
██║ ╚═╝ ██║╚██████╔╝██████╔╝███████╗███████╗██║     ╚██████╔╝███████╗███████║███████╗
╚═╝     ╚═╝ ╚═════╝ ╚═════╝ ╚══════╝╚══════╝╚═╝      ╚═════╝ ╚══════╝╚══════╝╚══════╝
```

**ML model monitoring for developers who just shipped their first model.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Python](https://img.shields.io/badge/Python-3.8%2B-blue)](https://pypi.org/project/modelpulse)
[![Node](https://img.shields.io/badge/Node.js-18%2B-green)](https://nodejs.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100%2B-teal)](https://fastapi.tiangolo.com)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

[**Live Demo**](https://modelpulse.dev) · [**Dashboard**](https://app.modelpulse.dev) · [**Docs**](https://docs.modelpulse.dev) · [**PyPI**](https://pypi.org/project/modelpulse)

<br/>

> *"Paste one decorator. Get a live health dashboard in 60 seconds."*

<br/>

</div>

---

## What is ModelPulse?

ModelPulse is an open-core ML model monitoring platform for developers. It detects data drift, generates AI-powered plain-English diagnoses via Claude, and fires Slack/email alerts — all from a single Python decorator around your predict function.

**No MLOps team required. No schema design. No enterprise sales call.**

```python
import modelpulse

modelpulse.init(
    api_key="mp_live_xxxx",
    model_id="your-model-id",
)

@modelpulse.monitor
def predict(features: dict):
    return model.predict([features])[0]
```

That's it. ModelPulse handles the rest.

---

## Features

| Feature | Description |
|---|---|
| ⚡ **Zero-config SDK** | One decorator. Works with sklearn, XGBoost, PyTorch — anything callable |
| 📡 **Drift Detection** | PSI + Kolmogorov-Smirnov tests run hourly. Auto-baseline from first 100 predictions |
| ✦ **AI Diagnosis** | Claude Sonnet analyzes drift and writes plain-English explanations |
| 🔔 **Smart Alerts** | Slack + email alerts with AI-generated diagnosis included |
| 📊 **Live Dashboard** | Feature drift heatmaps, prediction volume, confidence, latency — all real-time |
| 📄 **Shareable Reports** | One-click PDF/HTML reports with public share links |
| 🔑 **API Keys** | Cryptographic keys scoped per model. Shown once, never stored in plaintext |
| 🗂️ **Multi-DB** | PostgreSQL for relational data, MongoDB for high-volume prediction logs with TTL |

---

## Architecture

ModelPulse is a monorepo with four services:

```
modelpulse/
├── apps/
│   ├── frontend/          # React + Vite dashboard (Vercel)
│   ├── api/               # Node.js + Express REST API (Railway)
│   └── ml-engine/         # FastAPI drift detection engine (Railway)
├── sdk/                   # Python SDK (PyPI: pip install modelpulse)
├── landing/               # Landing page (Vercel)
└── infra/                 # Docker Compose for local dev
```

### Data flow

```
Python SDK
    │
    │  POST /api/v1/predictions/batch
    ▼
Node.js API  ──────────────────────► MongoDB (predictions, drift_snapshots)
    │                                PostgreSQL (users, models, api_keys)
    │  Hourly cron job
    ▼
FastAPI ML Engine
    │  PSI + KS drift scores
    ▼
Claude Sonnet
    │  Plain-English diagnosis
    ▼
DriftSnapshot stored ──────────────► Slack / Email alerts
    │
    ▼
React Dashboard
```

---

## Tech Stack

### Backend API (`apps/api`)
- **Runtime:** Node.js 18 + Express
- **Auth:** JWT (HS256) + Google OAuth + bcrypt API keys
- **Databases:** PostgreSQL (Sequelize ORM) + MongoDB (Mongoose)
- **AI:** Anthropic Claude Sonnet (`@anthropic-ai/sdk`)
- **Alerts:** Nodemailer (email) + Slack webhooks

### ML Engine (`apps/ml-engine`)
- **Framework:** FastAPI + Uvicorn
- **Drift:** PSI (Population Stability Index) + KS Test (SciPy)
- **Stats:** NumPy + Pandas
- **Auth:** Internal service secret header

### Frontend (`apps/frontend`)
- **Framework:** React 18 + Vite
- **State:** Zustand
- **Charts:** Recharts
- **Routing:** React Router DOM
- **Styling:** Tailwind CSS + CSS variables

### Python SDK (`sdk/`)
- **Zero dependencies** beyond `requests`
- **Thread-safe** batched prediction queue (10s flush interval)
- **Fire-and-forget** — never slows down your model
- **Compatible** with Python 3.8+

---

## Database Schema

### PostgreSQL (relational)

```
users          → id, email, name, password_hash, google_id, plan, stripe_customer_id
models         → id, user_id, name, task_type, feature_schema (JSONB), status
api_keys       → id, user_id, model_id, key_hash, key_prefix, label, last_used_at
alert_rules    → id, model_id, trigger_type, threshold, channel, slack_webhook_url
```

### MongoDB (time-series + high-volume)

```
predictions      → model_id, input_features, prediction, confidence, latency_ms, expires_at (TTL)
drift_snapshots  → model_id, feature_drift, prediction_drift, overall_health, ai_diagnosis
baselines        → model_id, feature_stats, prediction_stats, sample_size, is_ready
alert_events     → model_id, rule_id, snapshot_id, severity, message, acknowledged
```

---

## Local Development

### Prerequisites

- Node.js 18+
- Python 3.8+
- PostgreSQL 17+
- MongoDB 8+

### 1. Clone and install

```bash
git clone https://github.com/GPREETHAMSAXON/Model_Pulse.git
cd Model_Pulse
```

Install API dependencies:

```bash
cd apps/api
npm install
```

Install ML engine dependencies:

```bash
cd apps/ml-engine
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # Mac/Linux
pip install -r requirements.txt
```

Install frontend dependencies:

```bash
cd apps/frontend
npm install
```

### 2. Configure environment

```bash
cp .env.example apps/api/.env
```

Edit `apps/api/.env` and fill in:

```env
POSTGRES_URL=postgresql://postgres:yourpassword@localhost:5432/modelpulse
MONGODB_URI=mongodb://localhost:27017/modelpulse
JWT_SECRET=your_random_32_char_secret
ANTHROPIC_API_KEY=sk-ant-...
```

### 3. Create the database

```bash
psql -U postgres -c "CREATE DATABASE modelpulse;"
```

### 4. Start all services

**Terminal 1 — API:**
```bash
cd apps/api
npm run dev
# ✓ PostgreSQL connected
# ✓ MongoDB connected
# ✓ ModelPulse API running on http://localhost:4000
```

**Terminal 2 — ML Engine:**
```bash
cd apps/ml-engine
venv\Scripts\activate
uvicorn main:app --reload --port 8000
# Uvicorn running on http://127.0.0.1:8000
```

**Terminal 3 — Frontend:**
```bash
cd apps/frontend
npm run dev
# VITE ready on http://localhost:5173
```

---

## API Reference

### Authentication

All dashboard endpoints use `Authorization: Bearer <JWT_TOKEN>`.  
All SDK endpoints use `Authorization: Bearer <API_KEY>` (`mp_live_...` format).

### Core endpoints

```
POST   /api/v1/auth/register              Register new user
POST   /api/v1/auth/login                 Login
GET    /api/v1/auth/me                    Get current user

POST   /api/v1/models                     Create model
GET    /api/v1/models                     List models
GET    /api/v1/models/:id                 Get model
PATCH  /api/v1/models/:id                 Update model
DELETE /api/v1/models/:id                 Archive model
POST   /api/v1/models/:id/keys            Generate API key
GET    /api/v1/models/:id/keys            List API keys
DELETE /api/v1/models/:id/keys/:keyId     Revoke API key
GET    /api/v1/models/:id/snapshots       List drift snapshots

POST   /api/v1/predictions/batch          Ingest predictions (SDK)
GET    /api/v1/predictions/:modelId       Get prediction history
```

### ML Engine endpoints (internal)

```
POST   /drift/compute                     Compute PSI + KS drift scores
POST   /stats/compute                     Compute baseline statistics
GET    /health                            Health check
```

---

## Python SDK

### Installation

```bash
pip install modelpulse
```

### Quickstart

```python
import modelpulse

# Initialize once at startup
modelpulse.init(
    api_key="mp_live_xxxx",       # from dashboard → model → API Keys
    model_id="your-model-uuid",   # from dashboard
)

# Wrap your predict function
@modelpulse.monitor
def predict(features: dict):
    return my_model.predict([features])[0]

# That's it — ModelPulse logs every call automatically
result = predict({"age": 34, "income": 72000, "tenure_months": 12})
```

### Advanced usage

```python
# Return (prediction, confidence) tuple for confidence tracking
@modelpulse.monitor
def predict(features: dict):
    probs = model.predict_proba([features])[0]
    return probs.argmax(), probs.max()

# Custom API URL (self-hosted)
modelpulse.init(
    api_key="mp_live_xxxx",
    model_id="your-model-uuid",
    api_url="https://your-api.railway.app/api/v1",
)
```

### How it works

- **Batching:** Predictions are queued in memory and flushed every 10 seconds or when 50 accumulate
- **Non-blocking:** Uses a background thread — your predict function adds < 1ms overhead
- **Resilient:** Network failures are silently dropped — the SDK never crashes your application

---

## Drift Detection

ModelPulse uses two complementary statistical tests:

### Population Stability Index (PSI)

Measures the magnitude of distribution shift between baseline and current window.

| PSI Score | Status | Meaning |
|---|---|---|
| < 0.10 | 🟢 Healthy | No significant drift |
| 0.10 – 0.20 | 🟡 Warning | Moderate drift detected |
| > 0.20 | 🔴 Critical | Significant drift — model likely degraded |

### Kolmogorov-Smirnov Test (KS)

Two-sample KS test detects distributional differences. Fires when p-value < 0.05.

### Baseline

The baseline is computed automatically from the first 100 predictions. It can be manually reset from the dashboard. Drift is computed hourly against this reference distribution.

---

## Pricing

| Plan | Price | Models | Predictions/mo | Retention |
|---|---|---|---|---|
| **Hobby** | Free | 1 | 10k | 7 days |
| **Pro** | $19/mo | 5 | 500k | 90 days |
| **Team** | $79/mo | Unlimited | 5M | 1 year |

All plans include drift detection. AI diagnosis and Slack alerts require Pro+.

---

## Deployment

### Landing page → Vercel

```bash
cd landing
npx vercel --yes
```

### Frontend → Vercel

```bash
cd apps/frontend
npx vercel --yes
```

### API → Railway

```bash
# Install Railway CLI
npm install -g @railway/cli
railway login
cd apps/api
railway up
```

### ML Engine → Railway

```bash
cd apps/ml-engine
railway up
```

---

## Roadmap

- [ ] Ground truth feedback (upload actual labels to compute real accuracy)
- [ ] Multi-model A/B comparison
- [ ] LLM monitoring (prompt tracking, hallucination rate, token cost)
- [ ] Stripe billing integration
- [ ] PDF/HTML report export
- [ ] Public PyPI release (`pip install modelpulse`)
- [ ] GitHub Actions CI/CD pipeline

---

## Built by

**Saxon Preetham**  
B.Tech CSE · Vignan's Institute of Information Technology, Visakhapatnam  
Vice Chairperson, IEEE Student Branch  
GitHub: [@GPREETHAMSAXON](https://github.com/GPREETHAMSAXON)

---

## License

MIT License — see [LICENSE](LICENSE) for details.

---

<div align="center">

**If ModelPulse saved your model from silent failure, give it a ⭐**

</div>
