"""
Drift detection service.
Implements two complementary statistical tests:
  - PSI  (Population Stability Index) — measures distribution shift magnitude
  - KS   (Kolmogorov-Smirnov test)   — detects distributional differences

PSI thresholds (industry standard):
  < 0.10  → no significant drift   (healthy)
  0.10–0.25 → moderate drift       (warning)
  > 0.25  → significant drift      (critical)

IMPORTANT: PSI is unreliable with < 100 samples in either window.
With small samples, rely primarily on KS test (p-value based).
"""

import numpy as np
from scipy import stats
from typing import Any, Dict, List, Optional, Tuple


PSI_WARNING   = 0.10
PSI_CRITICAL  = 0.25
KS_PVALUE_THRESHOLD = 0.05
MIN_SAMPLES_FOR_PSI = 50   # PSI needs enough samples to be reliable


def compute_psi(baseline: np.ndarray, current: np.ndarray, bins: int = 10) -> Optional[float]:
    """
    Compute Population Stability Index between baseline and current distributions.
    Returns None if sample sizes are too small for reliable PSI.

    Key fix: use Laplace smoothing (add 1 to all counts) instead of tiny epsilon.
    This prevents log(near-zero) explosions with small samples.
    """
    if len(baseline) < MIN_SAMPLES_FOR_PSI or len(current) < MIN_SAMPLES_FOR_PSI:
        return None  # Not enough data — don't compute PSI, rely on KS instead

    if len(np.unique(baseline)) == 1:
        return 0.0  # Constant feature — no drift possible

    # Build bin edges from combined data for fair comparison
    combined = np.concatenate([baseline, current])
    edges = np.percentile(combined, np.linspace(0, 100, bins + 1))
    edges = np.unique(edges)  # Remove duplicate edges (can happen with discrete data)

    if len(edges) < 3:
        return 0.0  # Not enough distinct values to bin

    baseline_counts, _ = np.histogram(baseline, bins=edges)
    current_counts,  _ = np.histogram(current,  bins=edges)

    # Laplace smoothing — add 1 to every bin to avoid log(0)
    # This is the industry-standard fix for small-sample PSI
    baseline_pct = (baseline_counts + 1) / (len(baseline) + len(edges) - 1)
    current_pct  = (current_counts  + 1) / (len(current)  + len(edges) - 1)

    psi = float(np.sum((current_pct - baseline_pct) * np.log(current_pct / baseline_pct)))
    return round(max(0.0, psi), 6)  # PSI is always non-negative


def compute_ks(baseline: np.ndarray, current: np.ndarray) -> Tuple[float, float]:
    """
    Kolmogorov-Smirnov two-sample test.
    Works well even with small samples (20+).
    Returns (ks_statistic, p_value).
    """
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
            return None  # categorical — skip
    return np.array(numeric, dtype=float) if len(numeric) >= 5 else None


def extract_feature_column(predictions: List[Dict], feature: str) -> Optional[np.ndarray]:
    """Pull a single numeric feature column. Returns None for categorical features."""
    values = [p.get("input_features", {}).get(feature) for p in predictions]
    return try_to_float(values)


def extract_prediction_column(predictions: List[Dict]) -> Optional[np.ndarray]:
    """Extract prediction values as a numeric array using confidence scores."""
    values = []
    for p in predictions:
        conf = p.get("confidence")
        pred = p.get("prediction")
        val  = conf if conf is not None else pred
        try:
            values.append(float(val))
        except (ValueError, TypeError):
            continue
    return np.array(values, dtype=float) if len(values) >= 5 else None


def compute_feature_drift(
    baseline_preds: List[Dict],
    current_preds: List[Dict],
) -> Dict[str, Dict]:
    """
    Compute drift scores for every numeric feature.
    Primary signal: KS test (works with small samples)
    Secondary signal: PSI (only computed with 50+ samples)
    Drift decision: KS p-value < 0.05 OR PSI > threshold (when available)
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

        if baseline_col is None or current_col is None:
            continue  # categorical or insufficient data
        if len(baseline_col) < 10 or len(current_col) < 5:
            continue

        # KS test — primary signal (reliable with small samples)
        ks_stat, ks_pval = compute_ks(baseline_col, current_col)

        # PSI — secondary signal (only with enough data)
        psi = compute_psi(baseline_col, current_col)

        # Drift decision:
        # - If PSI available: drift = KS significant AND PSI > warning threshold
        # - If PSI not available: drift = KS significant with stricter threshold
        if psi is not None:
            drifted = (ks_pval < KS_PVALUE_THRESHOLD) and (psi > PSI_WARNING)
        else:
            # Only KS available — use stricter p-value threshold
            drifted = ks_pval < 0.01

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

    ks_stat, ks_pval = compute_ks(baseline_col, current_col)
    psi = compute_psi(baseline_col, current_col)

    if psi is not None:
        drifted = (ks_pval < KS_PVALUE_THRESHOLD) and (psi > PSI_WARNING)
    else:
        drifted = ks_pval < 0.01

    return {
        "psi":     psi,
        "drifted": drifted,
    }


def determine_health(feature_drift: Dict, prediction_drift: Dict) -> str:
    """
    Aggregate drift scores into overall model health.
    Uses PSI only when available, falls back to KS-only decisions.
    """
    any_critical = False
    any_warning  = False

    for scores in feature_drift.values():
        psi     = scores.get("psi")
        drifted = scores.get("drifted", False)
        ks_pval = scores.get("ks_pvalue", 1.0)

        if psi is not None and psi > PSI_CRITICAL:
            any_critical = True
        elif drifted and psi is not None and psi > PSI_WARNING:
            any_warning = True
        elif drifted and psi is None and ks_pval < 0.001:
            # Very strong KS signal without PSI
            any_critical = True
        elif drifted:
            any_warning = True

    # Check prediction drift
    pred_psi     = prediction_drift.get("psi")
    pred_drifted = prediction_drift.get("drifted", False)
    if pred_psi is not None and pred_psi > PSI_CRITICAL:
        any_critical = True
    elif pred_drifted:
        any_warning = True

    if any_critical:
        return "critical"
    if any_warning:
        return "warning"
    return "healthy"
