"""
Drift detection service — ModelPulse ML Engine v1.1
====================================================
Numeric features  : PSI (Population Stability Index) + KS test
Categorical features: Chi-squared test + Jensen-Shannon divergence
"""

import numpy as np
from scipy import stats
from scipy.spatial.distance import jensenshannon
from typing import Any, Dict, List, Optional, Tuple

PSI_WARNING          = 0.10
PSI_CRITICAL         = 0.25
KS_PVALUE_THRESHOLD  = 0.05
CHI_PVALUE_THRESHOLD = 0.05
JS_WARNING           = 0.10
JS_CRITICAL          = 0.25
MIN_SAMPLES_FOR_PSI  = 50


# ─────────────────────────────────────────────
# NUMERIC DRIFT
# ─────────────────────────────────────────────

def compute_psi(baseline: np.ndarray, current: np.ndarray, bins: int = 10) -> Optional[float]:
    if len(baseline) < MIN_SAMPLES_FOR_PSI or len(current) < MIN_SAMPLES_FOR_PSI:
        return None
    if len(np.unique(baseline)) == 1:
        return 0.0
    combined = np.concatenate([baseline, current])
    edges = np.percentile(combined, np.linspace(0, 100, bins + 1))
    edges = np.unique(edges)
    if len(edges) < 3:
        return 0.0
    baseline_counts, _ = np.histogram(baseline, bins=edges)
    current_counts,  _ = np.histogram(current,  bins=edges)
    baseline_pct = (baseline_counts + 1) / (len(baseline) + len(edges) - 1)
    current_pct  = (current_counts  + 1) / (len(current)  + len(edges) - 1)
    psi = float(np.sum((current_pct - baseline_pct) * np.log(current_pct / baseline_pct)))
    return round(max(0.0, psi), 6)


def compute_ks(baseline: np.ndarray, current: np.ndarray) -> Tuple[float, float]:
    ks_stat, p_value = stats.ks_2samp(baseline, current)
    return float(round(ks_stat, 6)), float(round(p_value, 6))


def try_to_float(values: List[Any]) -> Optional[np.ndarray]:
    numeric = []
    for v in values:
        if v is None:
            continue
        try:
            numeric.append(float(v))
        except (ValueError, TypeError):
            return None  # has non-numeric → categorical
    return np.array(numeric, dtype=float) if len(numeric) >= 5 else None


# ─────────────────────────────────────────────
# CATEGORICAL DRIFT
# ─────────────────────────────────────────────

def compute_categorical_drift(baseline_vals: List[str], current_vals: List[str]) -> Dict:
    """
    Detect drift in categorical/string features using:
      1. Chi-squared test  — detects frequency distribution changes
      2. Jensen-Shannon divergence — symmetric distance between distributions

    Works for plan_type, country, device_type, any string feature.
    """
    if len(baseline_vals) < 5 or len(current_vals) < 5:
        return {"js_divergence": None, "chi2_pvalue": None, "drifted": False, "type": "categorical"}

    # Get union of all categories
    all_cats = sorted(set(baseline_vals) | set(current_vals))

    if len(all_cats) < 2:
        return {"js_divergence": 0.0, "chi2_pvalue": 1.0, "drifted": False, "type": "categorical"}

    # Build frequency distributions
    def freq_dist(vals):
        counts = {c: 0 for c in all_cats}
        for v in vals:
            if v in counts:
                counts[v] += 1
        arr = np.array([counts[c] for c in all_cats], dtype=float)
        # Laplace smoothing to avoid zeros
        arr += 1
        return arr / arr.sum()

    baseline_dist = freq_dist(baseline_vals)
    current_dist  = freq_dist(current_vals)

    # Jensen-Shannon divergence (0=identical, 1=completely different)
    js_div = float(round(jensenshannon(baseline_dist, current_dist), 6))

    # Chi-squared test on raw counts
    baseline_counts = np.array([baseline_vals.count(c) for c in all_cats], dtype=float)
    current_counts  = np.array([current_vals.count(c)  for c in all_cats], dtype=float)

    # Scale current to same total as baseline for chi2
    if current_counts.sum() > 0 and baseline_counts.sum() > 0:
        expected = baseline_counts / baseline_counts.sum() * current_counts.sum()
        # Only run chi2 if expected counts are >= 1 in all cells
        if (expected >= 1).all():
            chi2_stat, chi2_pval = stats.chisquare(current_counts, f_exp=expected)
            chi2_pval = float(round(chi2_pval, 6))
        else:
            chi2_pval = None
    else:
        chi2_pval = None

    # Drift: JS divergence above warning threshold AND chi2 significant (if available)
    if chi2_pval is not None:
        drifted = (js_div > JS_WARNING) and (chi2_pval < CHI_PVALUE_THRESHOLD)
    else:
        drifted = js_div > JS_WARNING

    # Determine severity
    severity = "healthy"
    if js_div > JS_CRITICAL:
        severity = "critical"
    elif drifted:
        severity = "warning"

    return {
        "js_divergence": js_div,
        "chi2_pvalue":   chi2_pval,
        "drifted":       drifted,
        "severity":      severity,
        "type":          "categorical",
        "categories":    all_cats,
    }


def extract_categorical_column(predictions: List[Dict], feature: str) -> Optional[List[str]]:
    """Extract string values for a feature. Returns None if column is numeric."""
    values = []
    for p in predictions:
        v = p.get("input_features", {}).get(feature)
        if v is None:
            continue
        # If it's a number, it's not categorical
        try:
            float(v)
            return None  # numeric feature — skip
        except (ValueError, TypeError):
            values.append(str(v))
    return values if len(values) >= 5 else None


def extract_feature_column(predictions: List[Dict], feature: str) -> Optional[np.ndarray]:
    values = [p.get("input_features", {}).get(feature) for p in predictions]
    return try_to_float(values)


def extract_prediction_column(predictions: List[Dict]) -> Optional[np.ndarray]:
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


# ─────────────────────────────────────────────
# MAIN DRIFT COMPUTATION
# ─────────────────────────────────────────────

def compute_feature_drift(baseline_preds: List[Dict], current_preds: List[Dict]) -> Dict[str, Dict]:
    """
    Compute drift for every feature — both numeric and categorical.
    Numeric:     PSI + KS test
    Categorical: Chi-squared + Jensen-Shannon divergence
    """
    if not baseline_preds or not current_preds:
        return {}

    feature_names = set()
    for p in baseline_preds:
        feature_names.update(p.get("input_features", {}).keys())

    results = {}

    for feature in feature_names:
        # Try numeric first
        baseline_num = extract_feature_column(baseline_preds, feature)
        current_num  = extract_feature_column(current_preds,  feature)

        if baseline_num is not None and current_num is not None and len(baseline_num) >= 10 and len(current_num) >= 5:
            # ── NUMERIC FEATURE
            ks_stat, ks_pval = compute_ks(baseline_num, current_num)
            psi = compute_psi(baseline_num, current_num)

            if psi is not None:
                drifted = (ks_pval < KS_PVALUE_THRESHOLD) and (psi > PSI_WARNING)
            else:
                drifted = ks_pval < 0.01

            results[feature] = {
                "type":      "numeric",
                "psi":       psi,
                "ks_stat":   ks_stat,
                "ks_pvalue": ks_pval,
                "drifted":   drifted,
            }
            continue

        # Try categorical
        baseline_cat = extract_categorical_column(baseline_preds, feature)
        current_cat  = extract_categorical_column(current_preds,  feature)

        if baseline_cat is not None and current_cat is not None:
            # ── CATEGORICAL FEATURE
            cat_result = compute_categorical_drift(baseline_cat, current_cat)
            results[feature] = cat_result
            continue

    return results


def compute_prediction_drift(baseline_preds: List[Dict], current_preds: List[Dict]) -> Dict:
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

    return {"psi": psi, "drifted": drifted}


def determine_health(feature_drift: Dict, prediction_drift: Dict) -> str:
    any_critical = False
    any_warning  = False

    for scores in feature_drift.values():
        feature_type = scores.get("type", "numeric")

        if feature_type == "categorical":
            js  = scores.get("js_divergence", 0) or 0
            if js > JS_CRITICAL:
                any_critical = True
            elif scores.get("drifted"):
                any_warning = True
        else:
            psi     = scores.get("psi")
            drifted = scores.get("drifted", False)
            ks_pval = scores.get("ks_pvalue", 1.0)
            if psi is not None and psi > PSI_CRITICAL:
                any_critical = True
            elif drifted and psi is not None and psi > PSI_WARNING:
                any_warning = True
            elif drifted and psi is None and ks_pval < 0.001:
                any_critical = True
            elif drifted:
                any_warning = True

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
