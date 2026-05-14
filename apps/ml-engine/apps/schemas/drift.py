from pydantic import BaseModel
from typing import Any, Dict, List, Optional


class PredictionRecord(BaseModel):
    input_features: Dict[str, Any]
    prediction: Any
    confidence: Optional[float] = None
    timestamp: Optional[str] = None


class DriftRequest(BaseModel):
    model_id: str
    baseline: List[PredictionRecord]
    current: List[PredictionRecord]
    task_type: str = "classification"


class FeatureDriftResult(BaseModel):
    # Shared
    type: str = "numeric"            # numeric | categorical
    drifted: bool = False

    # Numeric fields
    psi: Optional[float] = None
    ks_stat: Optional[float] = None
    ks_pvalue: Optional[float] = None

    # Categorical fields
    js_divergence: Optional[float] = None
    chi2_pvalue: Optional[float] = None
    severity: Optional[str] = None
    categories: Optional[List[str]] = None


class DriftResponse(BaseModel):
    model_id: str
    prediction_count: int
    feature_drift: Dict[str, FeatureDriftResult]
    prediction_drift: FeatureDriftResult
    overall_health: str
