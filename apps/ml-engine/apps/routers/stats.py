from fastapi import APIRouter, HTTPException
from apps.schemas.stats import StatsRequest, StatsResponse
from apps.services.stats_service import compute_baseline_stats

router = APIRouter()


@router.post("/compute", response_model=StatsResponse)
def compute_stats(req: StatsRequest):
    """
    Compute baseline statistics for a model's prediction history.

    Called by the Node API when:
    - A model first reaches 100 predictions (auto-baseline)
    - A user manually resets the baseline from the dashboard
    """
    if not req.predictions:
        raise HTTPException(status_code=422, detail="No predictions provided.")

    result = compute_baseline_stats(req.predictions)

    return StatsResponse(
        model_id      = req.model_id,
        sample_size   = result["sample_size"],
        feature_stats = result["feature_stats"],
        prediction_stats = result["prediction_stats"],
    )
