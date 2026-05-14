from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
import os

load_dotenv()

from apps.routers import drift, stats

app = FastAPI(
    title="ModelPulse ML Engine",
    description="Drift detection and statistical analysis service for ModelPulse",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("API_URL", "http://localhost:4000")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Internal service auth — all requests must carry the ML_ENGINE_SECRET header
ML_ENGINE_SECRET = os.getenv("ML_ENGINE_SECRET", "internal_service_secret")

@app.middleware("http")
async def verify_internal_secret(request: Request, call_next):
    # Allow health check and docs without auth
    if request.url.path in ["/health", "/docs", "/redoc", "/openapi.json"]:
        return await call_next(request)

    secret = request.headers.get("x-internal-secret")
    if secret != ML_ENGINE_SECRET:
        return JSONResponse(status_code=401, content={"error": "Unauthorized"})

    return await call_next(request)


# ── Routers
app.include_router(drift.router,  prefix="/drift",  tags=["Drift Detection"])
app.include_router(stats.router,  prefix="/stats",  tags=["Statistics"])


# ── Health check
@app.get("/health", tags=["Health"])
def health_check():
    return {"status": "ok", "service": "ml-engine", "version": "0.1.0"}
