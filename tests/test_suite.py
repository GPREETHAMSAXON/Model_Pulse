# ModelPulse Comprehensive Test Suite
# Run: python test_suite.py
# Requires: pip install requests numpy scipy tabulate

import random
import time
import sys
import requests
import numpy as np
from scipy import stats
from tabulate import tabulate
from datetime import datetime

API_URL       = "http://localhost:4000/api/v1"
ML_ENGINE     = "http://localhost:8000"
TEST_EMAIL    = f"testuser_{int(time.time())}@modelpulse-test.com"
TEST_PASSWORD = "TestPass@2026"
TEST_NAME     = "Test Runner"

GREEN  = "\033[92m"
RED    = "\033[91m"
YELLOW = "\033[93m"
BLUE   = "\033[94m"
BOLD   = "\033[1m"
RESET  = "\033[0m"

results = []

def log(msg, color=RESET):
    print(f"{color}{msg}{RESET}")

def pass_test(name, detail=""):
    results.append({"Test": name, "Status": "PASS", "Detail": detail})
    log(f"  PASS  {name} — {detail}", GREEN)

def fail_test(name, detail=""):
    results.append({"Test": name, "Status": "FAIL", "Detail": detail})
    log(f"  FAIL  {name} — {detail}", RED)

def warn_test(name, detail=""):
    results.append({"Test": name, "Status": "WARN", "Detail": detail})
    log(f"  WARN  {name} — {detail}", YELLOW)

def fmt_psi(v):
    return "N/A" if v is None else f"{v:.4f}"

def send_predictions(api_key, predictions):
    r = requests.post(
        f"{API_URL}/predictions/batch",
        json={"predictions": predictions},
        headers={"Authorization": f"Bearer {api_key}"}
    )
    return r.status_code, r.json()

def make_prediction(age, income, tenure, plan="premium", label="retain", conf=None):
    if conf is None:
        conf = round(random.uniform(0.7, 0.98), 3)
    return {
        "input_features": {"age": age, "income": income, "tenure_months": tenure, "plan_type": plan},
        "prediction": label, "confidence": conf, "latency_ms": random.randint(15, 50)
    }

def make_normal_batch(n=50):
    batch = []
    for _ in range(n):
        age    = round(random.gauss(42, 10))
        income = round(random.gauss(75000, 15000))
        tenure = round(random.gauss(24, 10))
        label  = "churn" if random.random() < 0.35 else "retain"
        batch.append(make_prediction(age, income, tenure))
    return batch

def run_drift(model_id, baseline, current):
    r = requests.post(
        f"{ML_ENGINE}/drift/compute",
        json={"model_id": model_id, "task_type": "classification",
              "baseline": baseline, "current": current},
        headers={"x-internal-secret": "internal_service_secret"},
        timeout=30
    )
    return r.status_code, r.json() if r.status_code == 200 else {}

def setup():
    log(f"\n{BOLD}Setting up test environment...{RESET}", BLUE)
    r = requests.post(f"{API_URL}/auth/register", json={
        "name": TEST_NAME, "email": TEST_EMAIL, "password": TEST_PASSWORD
    })
    if r.status_code != 201:
        log(f"Registration failed: {r.text}", RED); sys.exit(1)
    token = r.json()["token"]
    headers = {"Authorization": f"Bearer {token}"}
    log(f"  Registered: {TEST_EMAIL}", GREEN)

    r = requests.post(f"{API_URL}/models", json={
        "name": "Test Churn Model", "task_type": "classification",
        "description": "Automated test model",
        "feature_schema": {"age": "float", "income": "float",
                           "tenure_months": "float", "plan_type": "string"}
    }, headers=headers)
    if r.status_code != 201:
        log(f"Model creation failed: {r.text}", RED); sys.exit(1)
    model_id = r.json()["data"]["id"]
    log(f"  Model ID: {model_id}", GREEN)

    r = requests.post(f"{API_URL}/models/{model_id}/keys",
                      json={"label": "Test key"}, headers=headers)
    if r.status_code != 201:
        log(f"API key failed: {r.text}", RED); sys.exit(1)
    api_key = r.json()["api_key"]
    log(f"  API key: {api_key[:20]}...", GREEN)
    return token, model_id, api_key, headers


def test_api_health():
    log(f"\n{BOLD}TEST 1: API Health{RESET}")
    try:
        r = requests.get("http://localhost:4000/health", timeout=5)
        if r.status_code == 200 and r.json().get("status") == "ok":
            pass_test("API health", f"env={r.json().get('env')}")
        else:
            fail_test("API health", f"Got {r.status_code}")
    except Exception as e:
        fail_test("API health", f"Connection refused: {e}")


def test_ml_engine_health():
    log(f"\n{BOLD}TEST 2: ML Engine Health{RESET}")
    try:
        r = requests.get(f"{ML_ENGINE}/health", timeout=5)
        if r.status_code == 200:
            pass_test("ML engine health", f"version={r.json().get('version')}")
        else:
            fail_test("ML engine health", f"Got {r.status_code}")
    except Exception as e:
        fail_test("ML engine health", f"Connection refused: {e}")


def test_psi_math():
    log(f"\n{BOLD}TEST 3: PSI Math Validation{RESET}")
    np.random.seed(42)
    dist_a = np.random.normal(50, 10, 1000)
    dist_b = np.random.normal(50, 10, 1000)
    dist_c = np.random.normal(100, 10, 1000)

    def psi(baseline, current, bins=10):
        mn = min(baseline.min(), current.min())
        mx = max(baseline.max(), current.max())
        edges = np.linspace(mn, mx, bins + 1)
        eps = 1e-8
        bc, _ = np.histogram(baseline, bins=edges)
        cc, _ = np.histogram(current, bins=edges)
        bp = (bc + eps) / (len(baseline) + eps * bins)
        cp = (cc + eps) / (len(current) + eps * bins)
        return float(np.sum((cp - bp) * np.log(cp / bp)))

    p_same = psi(dist_a, dist_b)
    p_diff = psi(dist_a, dist_c)

    if p_same < 0.10:
        pass_test("PSI same distributions ~0", f"PSI={p_same:.6f}")
    else:
        fail_test("PSI same distributions too high", f"PSI={p_same:.4f}")

    if p_diff > 0.20:
        pass_test("PSI different distributions >0.20", f"PSI={p_diff:.4f}")
    else:
        fail_test("PSI different distributions too low", f"PSI={p_diff:.4f}")

    _, p1 = stats.ks_2samp(dist_a, dist_b)
    if p1 > 0.05:
        pass_test("KS same distributions not rejected", f"p={p1:.4f}")
    else:
        fail_test("KS false positive on same distributions", f"p={p1:.4f}")

    _, p2 = stats.ks_2samp(dist_a, dist_c)
    if p2 < 0.05:
        pass_test("KS different distributions rejected", f"p={p2:.8f}")
    else:
        fail_test("KS missed different distributions", f"p={p2:.4f}")


def test_prediction_ingestion(api_key):
    log(f"\n{BOLD}TEST 4: Prediction Ingestion{RESET}")

    code, resp = send_predictions(api_key, [make_prediction(34, 72000, 12)])
    if code == 202 and resp.get("accepted") == 1:
        pass_test("Single prediction", "accepted=1")
    else:
        fail_test("Single prediction", f"Got {code}")

    code, resp = send_predictions(api_key, make_normal_batch(50))
    if code == 202 and resp.get("accepted") == 50:
        pass_test("Batch of 50", "accepted=50")
    else:
        fail_test("Batch of 50", f"Got {code}")

    code, resp = send_predictions(api_key, make_normal_batch(50) * 10)
    if code == 202 and resp.get("accepted") == 500:
        pass_test("Max batch 500", "accepted=500")
    else:
        fail_test("Max batch 500", f"Got {code}")

    code, resp = send_predictions(api_key, make_normal_batch(50) * 10 + [make_prediction(30, 50000, 5)])
    if code == 422:
        pass_test("Over-limit 501 rejected", "422 as expected")
    else:
        warn_test("Over-limit 501", f"Expected 422, got {code}")


def test_edge_cases(api_key):
    log(f"\n{BOLD}TEST 5: Edge Cases{RESET}")

    code, _ = send_predictions(api_key, [{"input_features": {"age": None, "income": 75000},
                                           "prediction": "retain", "confidence": 0.85, "latency_ms": 20}])
    if code == 202: pass_test("Null feature value", "age=None handled")
    else: fail_test("Null feature value", f"Got {code}")

    code, _ = send_predictions(api_key, [{"input_features": {}, "prediction": "retain",
                                           "confidence": 0.85, "latency_ms": 20}])
    if code == 202: pass_test("Empty features dict", "handled")
    else: fail_test("Empty features dict", f"Got {code}")

    code, _ = send_predictions(api_key, [{"input_features": {"age": 30}, "prediction": "churn"}])
    if code == 202: pass_test("Missing confidence (optional)", "works fine")
    else: fail_test("Missing confidence", f"Got {code}")

    r = requests.post(f"{API_URL}/predictions/batch",
        json={"predictions": [make_prediction(30, 50000, 5)]},
        headers={"Authorization": "Bearer mp_fake_invalid_key"})
    if r.status_code == 401: pass_test("Invalid API key rejected", "401")
    else: fail_test("Invalid API key", f"Expected 401, got {r.status_code}")

    code, _ = send_predictions(api_key, [])
    if code == 422: pass_test("Empty array rejected", "422")
    else: warn_test("Empty array", f"Expected 422, got {code}")


def test_auth_security():
    log(f"\n{BOLD}TEST 6: Auth Security{RESET}")

    r = requests.post(f"{API_URL}/auth/register", json={"name": TEST_NAME, "email": TEST_EMAIL, "password": TEST_PASSWORD})
    if r.status_code == 409: pass_test("Duplicate email rejected", "409")
    else: fail_test("Duplicate email", f"Got {r.status_code}")

    r = requests.post(f"{API_URL}/auth/login", json={"email": TEST_EMAIL, "password": "wrongpassword"})
    if r.status_code == 401: pass_test("Wrong password rejected", "401")
    else: fail_test("Wrong password", f"Got {r.status_code}")

    r = requests.get(f"{API_URL}/auth/me", headers={"Authorization": "Bearer fake.jwt.token"})
    if r.status_code == 401: pass_test("Fake JWT rejected", "401")
    else: fail_test("Fake JWT", f"Got {r.status_code}")

    r = requests.post(f"{API_URL}/auth/register", json={"name": "T", "email": "x@x.com", "password": "short"})
    if r.status_code == 422: pass_test("Short password rejected", "422")
    else: warn_test("Short password", f"Expected 422, got {r.status_code}")


def test_high_volume(api_key):
    log(f"\n{BOLD}TEST 7: High Volume (1000 predictions){RESET}")
    total, accepted, errors = 0, 0, 0
    start = time.time()
    for i in range(10):
        try:
            code, resp = send_predictions(api_key, make_normal_batch(100))
            if code == 202:
                accepted += resp.get("accepted", 0)
                total += 100
            else:
                errors += 1
        except Exception as e:
            errors += 1
    elapsed = time.time() - start
    throughput = total / elapsed if elapsed > 0 else 0
    log(f"  Sent={total} Accepted={accepted} Errors={errors} Time={elapsed:.2f}s Rate={throughput:.0f}/s")
    if errors == 0 and accepted == 1000:
        pass_test("1000 predictions stress test", f"{throughput:.0f} pred/sec")
    elif errors <= 2:
        warn_test("High volume minor failures", f"{errors} failed")
    else:
        fail_test("High volume", f"{errors} batches failed")


def test_true_negative(model_id):
    log(f"\n{BOLD}TEST 8: True Negative — No Drift{RESET}")
    random.seed(42); np.random.seed(42)

    baseline = [{"input_features": {
        "age": float(np.random.normal(42, 10)),
        "income": float(np.random.normal(75000, 15000)),
        "tenure_months": float(np.random.normal(24, 8))},
        "prediction": "retain",
        "confidence": round(random.uniform(0.72, 0.96), 3)} for _ in range(80)]

    current = [{"input_features": {
        "age": float(np.random.normal(42, 10)),
        "income": float(np.random.normal(75000, 15000)),
        "tenure_months": float(np.random.normal(24, 8))},
        "prediction": "retain",
        "confidence": round(random.uniform(0.72, 0.96), 3)} for _ in range(20)]

    try:
        code, result = run_drift(model_id, baseline, current)
        if code != 200:
            fail_test("True negative call", f"ML engine {code}"); return
        health = result.get("overall_health")
        fd = result.get("feature_drift", {})
        log(f"  Health: {health} | {[(f, fmt_psi(s.get('psi')), s.get('drifted')) for f,s in fd.items()]}")
        if health == "healthy": pass_test("True negative", "health=healthy — no false positive")
        elif health == "warning": warn_test("True negative borderline", "warning on same dist")
        else: fail_test("True negative false positive", "critical on same distribution!")
        drifted = [f for f,s in fd.items() if s.get("drifted")]
        if not drifted: pass_test("No false positives on features", "all OK")
        elif len(drifted) == 1: warn_test(f"1 borderline: {drifted}", "small sample variance")
        else: fail_test(f"Multiple false positives: {drifted}")
    except Exception as e:
        fail_test("True negative", str(e))


def test_true_positive(model_id):
    log(f"\n{BOLD}TEST 9: True Positive — Obvious Drift{RESET}")
    random.seed(42); np.random.seed(42)

    baseline = [{"input_features": {
        "age": float(np.random.normal(48, 8)),
        "income": float(np.random.normal(85000, 12000)),
        "tenure_months": float(np.random.normal(30, 8))},
        "prediction": "retain",
        "confidence": round(random.uniform(0.8, 0.97), 3)} for _ in range(80)]

    current = [{"input_features": {
        "age": float(np.random.normal(22, 3)),
        "income": float(np.random.normal(28000, 5000)),
        "tenure_months": float(np.random.normal(2, 1))},
        "prediction": "churn",
        "confidence": round(random.uniform(0.75, 0.92), 3)} for _ in range(20)]

    try:
        code, result = run_drift(model_id, baseline, current)
        if code != 200:
            fail_test("True positive call", f"ML engine {code}"); return
        health = result.get("overall_health")
        fd = result.get("feature_drift", {})
        log(f"  Health: {health} | {[(f, fmt_psi(s.get('psi')), s.get('drifted')) for f,s in fd.items()]}")
        if health == "critical": pass_test("True positive", "health=critical as expected")
        elif health == "warning": warn_test("True positive warning only", "expected critical")
        else: fail_test("True positive MISSED", "health=healthy on obvious drift!")
        drifted = [f for f,s in fd.items() if s.get("drifted")]
        if len(drifted) >= 2: pass_test(f"Multiple features detected: {drifted}")
        elif len(drifted) == 1: warn_test(f"Only 1 feature: {drifted}", "expected 3")
        else: fail_test("No features detected on obvious drift")
    except Exception as e:
        fail_test("True positive", str(e))


def test_gradual_drift(model_id):
    log(f"\n{BOLD}TEST 10: Gradual Drift Detection{RESET}")
    random.seed(42); np.random.seed(42)

    baseline = [{"input_features": {
        "age": float(np.random.normal(42, 10)),
        "income": float(np.random.normal(75000, 15000)),
        "tenure_months": float(np.random.normal(24, 8))},
        "prediction": "retain",
        "confidence": round(random.uniform(0.75, 0.95), 3)} for _ in range(80)]

    current = [{"input_features": {
        "age": float(np.random.normal(46, 10)),
        "income": float(np.random.normal(60000, 12000)),
        "tenure_months": float(np.random.normal(20, 8))},
        "prediction": "churn",
        "confidence": round(random.uniform(0.65, 0.88), 3)} for _ in range(20)]

    try:
        code, result = run_drift(model_id, baseline, current)
        if code != 200:
            fail_test("Gradual drift call", f"ML engine {code}"); return
        health = result.get("overall_health")
        fd = result.get("feature_drift", {})
        log(f"  Health: {health} | {[(f, fmt_psi(s.get('psi'))) for f,s in fd.items()]}")
        if health in ["warning", "critical"]: pass_test("Gradual drift detected", f"health={health}")
        else: warn_test("Gradual drift missed", "health=healthy — 20% income drop not caught")
    except Exception as e:
        fail_test("Gradual drift", str(e))


if __name__ == "__main__":
    log(f"\n{BOLD}{BLUE}ModelPulse Test Suite v1.0{RESET}")
    log(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    test_api_health()
    test_ml_engine_health()
    test_psi_math()

    try:
        token, model_id, api_key, headers = setup()
    except SystemExit:
        log("Setup failed", RED); sys.exit(1)

    test_prediction_ingestion(api_key)
    test_edge_cases(api_key)
    test_auth_security()
    test_high_volume(api_key)
    log(f"\n  Waiting 2s for MongoDB...", YELLOW)
    time.sleep(2)
    test_true_negative(model_id)
    test_true_positive(model_id)
    test_gradual_drift(model_id)

    log(f"\n{BOLD}{'='*60}{RESET}", BLUE)
    passed = sum(1 for r in results if r["Status"] == "PASS")
    warned = sum(1 for r in results if r["Status"] == "WARN")
    failed = sum(1 for r in results if r["Status"] == "FAIL")
    total  = len(results)

    print(tabulate([[r["Test"], r["Status"], r["Detail"]] for r in results],
        headers=["Test", "Status", "Detail"], tablefmt="rounded_outline"))

    log(f"\n  Total={total}  Passed={passed}  Warned={warned}  Failed={failed}")
    if failed == 0: log(f"  ALL TESTS PASSED!", GREEN)
    elif failed <= 2: log(f"  {failed} test(s) failed", YELLOW)
    else: log(f"  {failed} test(s) failed — needs attention", RED)
    log(f"  Finished: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
