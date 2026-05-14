"""
Statistical summary service.
Computes baseline statistics for each feature and prediction output.
These stats are stored in MongoDB baselines collection and used
as the reference distribution for all future drift calculations.
"""

import numpy as np
from typing import Any, Dict, List, Optional


def compute_histogram(values: np.ndarray, bins: int = 20) -> List[Dict]:
    """Build histogram bins for dashboard visualization."""
    counts, edges = np.histogram(values, bins=bins)
    return [
        {
            "bin_start": round(float(edges[i]), 4),
            "bin_end":   round(float(edges[i + 1]), 4),
            "count":     int(counts[i]),
        }
        for i in range(len(counts))
    ]


def compute_feature_stats(values: List[Any]) -> Dict:
    """Compute descriptive statistics for a single feature column."""
    numeric_vals = []
    string_vals  = []

    for v in values:
        if v is None:
            continue
        try:
            numeric_vals.append(float(v))
        except (ValueError, TypeError):
            string_vals.append(str(v))

    # Categorical feature
    if string_vals and not numeric_vals:
        unique, counts = np.unique(string_vals, return_counts=True)
        return {
            "dtype":        "string",
            "mean":         None,
            "std":          None,
            "min":          None,
            "max":          None,
            "median":       None,
            "histogram":    [],
            "value_counts": dict(zip(unique.tolist(), counts.tolist())),
        }

    # Numeric feature
    arr = np.array(numeric_vals)
    return {
        "dtype":        "float",
        "mean":         round(float(arr.mean()), 6),
        "std":          round(float(arr.std()), 6),
        "min":          round(float(arr.min()), 6),
        "max":          round(float(arr.max()), 6),
        "median":       round(float(np.median(arr)), 6),
        "histogram":    compute_histogram(arr),
        "value_counts": {},
    }


def compute_prediction_stats(predictions: List[Dict]) -> Dict:
    """Compute stats on the prediction output distribution."""
    confidences = []
    pred_values = []
    class_counts: Dict[str, int] = {}

    for p in predictions:
        pred = p.get("prediction")
        conf = p.get("confidence")

        if conf is not None:
            try:
                confidences.append(float(conf))
            except (ValueError, TypeError):
                pass

        if pred is not None:
            key = str(pred)
            class_counts[key] = class_counts.get(key, 0) + 1
            try:
                pred_values.append(float(pred))
            except (ValueError, TypeError):
                pass

    result: Dict[str, Any] = {
        "class_distribution": class_counts,
        "mean":      None,
        "std":       None,
        "histogram": [],
    }

    # Use confidence scores for distribution stats if available
    source = confidences if confidences else pred_values
    if source:
        arr = np.array(source)
        result["mean"]      = round(float(arr.mean()), 6)
        result["std"]       = round(float(arr.std()), 6)
        result["histogram"] = compute_histogram(arr, bins=10)

    return result


def compute_baseline_stats(predictions: List[Dict]) -> Dict:
    """
    Full baseline computation for a model.
    Input: list of prediction dicts with input_features, prediction, confidence.
    Output: feature_stats + prediction_stats ready to store in MongoDB.
    """
    if not predictions:
        return {"feature_stats": {}, "prediction_stats": {}, "sample_size": 0}

    # Collect all feature names
    feature_names = set()
    for p in predictions:
        feature_names.update(p.get("input_features", {}).keys())

    feature_stats = {}
    for feature in feature_names:
        values = [p.get("input_features", {}).get(feature) for p in predictions]
        feature_stats[feature] = compute_feature_stats(values)

    prediction_stats = compute_prediction_stats(predictions)

    return {
        "feature_stats":    feature_stats,
        "prediction_stats": prediction_stats,
        "sample_size":      len(predictions),
    }
