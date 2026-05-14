"""
Drift detection service.
Implements two complementary statistical tests:
  - PSI  (Population Stability Index) — measures distribution shift magnitude
  - KS   (Kolmogorov-Smirnov test)   — detects distributional differences

PSI thresholds (industry standard):
  < 0.10  → no significant drift   (healthy)
  0.10–0.20 → moderate drift       (warning)
  > 0.20  → significant drift      (critical)
"""

import numpy as np
from scipy import stats
from typing import Any, Dict, List, Optional, Tuple


PSI_WARNING  = 0.10
PSI_CRITICAL = 0.20
KS_PVALUE_THRESHOLD = 0.05


def compute_psi(baseline: np.ndarray, current: np.ndarray, bins: int = 10) -> float:
    """Compute Population Stability Index between baseline and current distributions."""
    min_val = min(baseline.min(), current.min())
    max_val = max(baseline.max(), current.max())

    if min_val == max_val:
        return 0.0

    edges = np.linspace(min_val, max_val, bins + 1)

    baseline_counts, _ = np.histogram(baseline, bins=edges)
    current_counts,  _ = np.histogram(current,  bins=edges)

    eps = 1e-8
    baseline_pct = (baseline_counts + eps) / (len(baseline) + eps * bins)
    current_pct  = (current_counts  + eps) / (len(current)  + eps * bins)

    psi = np.sum((current_pct - baseline_pct) * np.log(current_pct / baseline_pct))
    return float(round(psi, 6))


def compute_ks(baseline: np.ndarray, current: np.ndarray) -> Tuple[float, float]:
    """Kolmogorov-Smirnov two-sample test. Returns (ks_statistic, p_value)."""
    ks_stat, p_value = stats.ks_2samp(baseline, current)
    return float(round(ks_stat, 6)), float(round(p_value, 6))


def try_to_float(values: List[Any]) -> Optional[np.ndarray]:
    """
    Attempt to convert a list of values to a float numpy array.
    Returns None if the feature is categorical (non-numeric).
    Silently drops None/null values.
    """
    numeric = []
    for v in values:
        if v is None:
            continue
        try:
            numeric.append(float(v))
        except (ValueError, TypeError):
            return None  # first non-numeric value → categorical, skip entirely
    return np.array(numeric, dtype=float) if numeric else None


def extract_feature_column(predictions: List[Dict], feature: str) -> Optional[np.ndarray]:
    """Pull a single numeric feature column. Returns None for categorical features."""
    values = [p.get("input_features", {}).get(feature) for p in predictions]
    return try_to_float(values)


def extract_prediction_column(predictions: List[Dict]) -> Optional[np.ndarray]:
    """
    Extract prediction values as a numeric array.
    Uses confidence scores when available, falls back to raw prediction value.
    """
    values = []
    for p in predictions:
        conf = p.get("confidence")
        pred = p.get("prediction")
        val  = conf if conf is not None else pred
        try:
            values.append(float(val))
        except (ValueError, TypeError):
            continue
    return np.array(values, dtype=float) if values else None


def compute_feature_drift(
    baseline_preds: List[Dict],
    current_preds: List[Dict],
) -> Dict[str, Dict]:
    """
    Compute drift scores for every numeric feature.
    Categorical features (strings) are silently skipped.
    Returns a dict keyed by feature name.
    """
    if not baseline_preds or not current_preds:
        return {}

    feature_names = set()
    for p in baseline_preds:
        feature_names.update(p.get("input_features", {}).keys())

    results = {}

    for feature in feature_names:
        baseline_col = extract_feature_column(baseline_preds, feature)
        current_col  = extract_feature_column(current_preds,  feature)

        # Skip categorical features or columns with insufficient data
        if baseline_col is None or current_col is None:
            continue
        if len(baseline_col) < 10 or len(current_col) < 5:
            continue

        psi              = compute_psi(baseline_col, current_col)
        ks_stat, ks_pval = compute_ks(baseline_col, current_col)
        drifted          = psi > PSI_WARNING or ks_pval < KS_PVALUE_THRESHOLD

        results[feature] = {
            "psi":       psi,
            "ks_stat":   ks_stat,
            "ks_pvalue": ks_pval,
            "drifted":   drifted,
        }

    return results


def compute_prediction_drift(
    baseline_preds: List[Dict],
    current_preds: List[Dict],
) -> Dict:
    """Compute drift on the prediction output distribution."""
    baseline_col = extract_prediction_column(baseline_preds)
    current_col  = extract_prediction_column(current_preds)

    if baseline_col is None or current_col is None:
        return {"psi": None, "drifted": False}
    if len(baseline_col) < 10 or len(current_col) < 5:
        return {"psi": None, "drifted": False}

    psi = compute_psi(baseline_col, current_col)
    return {
        "psi":     psi,
        "drifted": psi > PSI_WARNING,
    }


def determine_health(feature_drift: Dict, prediction_drift: Dict) -> str:
    """Aggregate drift scores into an overall model health status."""
    critical = (
        any(v.get("psi", 0) > PSI_CRITICAL for v in feature_drift.values())
        or (prediction_drift.get("psi") or 0) > PSI_CRITICAL
    )
    if critical:
        return "critical"

    warning = (
        any(v.get("drifted") for v in feature_drift.values())
        or prediction_drift.get("drifted")
    )
    if warning:
        return "warning"

    return "healthy"
