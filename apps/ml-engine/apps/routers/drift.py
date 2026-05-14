from fastapi import APIRouter, HTTPException
from apps.schemas.drift import DriftRequest, DriftResponse, FeatureDriftResult
from apps.services.drift_service import (
    compute_feature_drift,
    compute_prediction_drift,
    determine_health,
)

router = APIRouter()


@router.post("/compute", response_model=DriftResponse)
def compute_drift(req: DriftRequest):
    """
    Compute drift between a baseline and current window of predictions.

    Called by the Node API's hourly drift cron job.
    Returns per-feature PSI + KS scores and an overall health status.
    """
    if len(req.baseline) < 10:
        raise HTTPException(
            status_code=422,
            detail="Baseline must have at least 10 predictions to compute drift."
        )
    if len(req.current) < 5:
        raise HTTPException(
            status_code=422,
            detail="Current window must have at least 5 predictions."
        )

    # Convert Pydantic models to plain dicts for service functions
    baseline_dicts = [p.model_dump() for p in req.baseline]
    current_dicts  = [p.model_dump() for p in req.current]

    feature_drift    = compute_feature_drift(baseline_dicts, current_dicts)
    prediction_drift = compute_prediction_drift(baseline_dicts, current_dicts)
    overall_health   = determine_health(feature_drift, prediction_drift)

    # Convert to response schema
    feature_drift_response = {
        k: FeatureDriftResult(**v) for k, v in feature_drift.items()
    }

    return DriftResponse(
        model_id         = req.model_id,
        prediction_count = len(current_dicts),
        feature_drift    = feature_drift_response,
        prediction_drift = FeatureDriftResult(**prediction_drift) if prediction_drift.get("psi") is not None else FeatureDriftResult(),
        overall_health   = overall_health,
    )
