from pydantic import BaseModel
from typing import Any, Dict, List, Optional


class StatsRequest(BaseModel):
    model_id: str
    predictions: List[Dict[str, Any]]
    task_type: str = "classification"


class FeatureStats(BaseModel):
    mean: Optional[float] = None
    std: Optional[float] = None
    min: Optional[float] = None
    max: Optional[float] = None
    median: Optional[float] = None
    histogram: List[Dict] = []
    value_counts: Dict[str, int] = {}
    dtype: str = "float"


class StatsResponse(BaseModel):
    model_id: str
    sample_size: int
    feature_stats: Dict[str, FeatureStats]
    prediction_stats: Dict[str, Any]
