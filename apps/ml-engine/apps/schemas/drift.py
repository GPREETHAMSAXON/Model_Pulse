from pydantic import BaseModel, Field
from typing import Any, Dict, List, Optional


class PredictionRecord(BaseModel):
    input_features: Dict[str, Any]
    prediction: Any
    confidence: Optional[float] = None
    timestamp: Optional[str] = None


class BaselineRequest(BaseModel):
    model_id: str
    predictions: List[PredictionRecord]


class DriftRequest(BaseModel):
    model_id: str
    baseline: List[PredictionRecord]   # reference distribution
    current: List[PredictionRecord]    # production window to test
    task_type: str = "classification"  # classification | regression


class FeatureDriftResult(BaseModel):
    psi: Optional[float] = None
    ks_stat: Optional[float] = None
    ks_pvalue: Optional[float] = None
    drifted: bool = False


class DriftResponse(BaseModel):
    model_id: str
    prediction_count: int
    feature_drift: Dict[str, FeatureDriftResult]
    prediction_drift: FeatureDriftResult
    overall_health: str  # healthy | warning | critical
