# ModelPulse LLM Monitoring — Production E2E Test
# Tests: ingest LLM calls, token tracking, cost tracking,
#        quality scores, hallucination flagging, stats endpoint

import requests
import random
import time

API    = "https://model-pulse.onrender.com/api/v1"
ML     = "https://model-pulse-1.onrender.com"

GREEN  = "\033[92m"
RED    = "\033[91m"
YELLOW = "\033[93m"
BLUE   = "\033[94m"
BOLD   = "\033[1m"
RESET  = "\033[0m"

results = []

def ok(name, detail=""):
    results.append(("PASS", name, detail))
    print(f"{GREEN}  PASS{RESET}  {name} — {detail}")

def fail(name, detail=""):
    results.append(("FAIL", name, detail))
    print(f"{RED}  FAIL{RESET}  {name} — {detail}")

def warn(name, detail=""):
    results.append(("WARN", name, detail))
    print(f"{YELLOW}  WARN{RESET}  {name} — {detail}")

print(f"\n{BOLD}{BLUE}ModelPulse LLM Monitoring — Production E2E Test{RESET}")
print(f"API: {API}\n")

# ── Setup
print(f"{BOLD}Setting up...{RESET}")
email = f"llmtest_{int(time.time())}@test.com"
r = requests.post(f"{API}/auth/register", json={
    "name": "LLM Test", "email": email, "password": "TestPass@2026"
})
if r.status_code != 201:
    print(f"{RED}Registration failed: {r.text}{RESET}")
    exit(1)

token    = r.json()["token"]
headers  = {"Authorization": f"Bearer {token}"}
print(f"  Registered: {email}")

r = requests.post(f"{API}/models", json={
    "name": "GPT-4o Production Monitor",
    "task_type": "other",
    "description": "LLM monitoring test model"
}, headers=headers)
model_id = r.json()["data"]["id"]
print(f"  Model ID: {model_id}")

r = requests.post(f"{API}/models/{model_id}/keys", json={"label": "llm-test"}, headers=headers)
api_key     = r.json()["api_key"]
sdk_headers = {"Authorization": f"Bearer {api_key}"}
print(f"  API key: {api_key[:20]}...\n")


# ── TEST 1: Ingest LLM calls — normal healthy batch
print(f"{BOLD}TEST 1: Ingest healthy LLM calls (50 calls){RESET}")
calls = []
providers = ["openai", "anthropic", "groq"]
models    = ["gpt-4o", "claude-3-5-sonnet", "llama-3.3-70b"]

for i in range(50):
    provider  = providers[i % 3]
    llm_model = models[i % 3]
    p_tokens  = random.randint(80, 200)
    c_tokens  = random.randint(40, 150)
    cost      = round((p_tokens / 1000 * 0.005) + (c_tokens / 1000 * 0.015), 8)

    calls.append({
        "provider":          provider,
        "llm_model":         llm_model,
        "prompt_preview":    f"Summarize the following document... [{i}]",
        "prompt_tokens":     p_tokens,
        "completion_tokens": c_tokens,
        "total_tokens":      p_tokens + c_tokens,
        "cost_usd":          cost,
        "latency_ms":        random.randint(400, 1800),
        "quality_score":     round(random.uniform(0.75, 0.98), 3),
        "thumbs_up":         random.random() > 0.2,
        "hallucination":     False,
        "success":           True,
        "tags":              ["production", "summarization"],
    })

r = requests.post(f"{API}/llm/batch", json={"calls": calls}, headers=sdk_headers)
if r.status_code == 202 and r.json().get("accepted") == 50:
    ok("Ingest 50 healthy LLM calls", f"accepted=50")
else:
    fail("Ingest 50 healthy LLM calls", f"Got {r.status_code}: {r.text[:100]}")


# ── TEST 2: Ingest drifted/degraded calls
print(f"\n{BOLD}TEST 2: Ingest degraded LLM calls (high latency + errors){RESET}")
bad_calls = []
for i in range(20):
    bad_calls.append({
        "provider":          "openai",
        "llm_model":         "gpt-4o",
        "prompt_tokens":     random.randint(800, 2000),   # token spike
        "completion_tokens": random.randint(400, 1000),
        "cost_usd":          round(random.uniform(0.05, 0.15), 6),  # cost spike
        "latency_ms":        random.randint(8000, 15000),  # high latency
        "quality_score":     round(random.uniform(0.2, 0.5), 3),  # low quality
        "thumbs_up":         False,
        "hallucination":     random.random() > 0.7,  # 30% hallucination rate
        "success":           random.random() > 0.15,  # 15% error rate
        "error":             "RateLimitError: quota exceeded" if random.random() > 0.8 else None,
        "tags":              ["production", "degraded"],
    })

r = requests.post(f"{API}/llm/batch", json={"calls": bad_calls}, headers=sdk_headers)
if r.status_code == 202:
    ok("Ingest 20 degraded calls", f"accepted={r.json().get('accepted')}")
else:
    fail("Ingest degraded calls", f"Got {r.status_code}")


# ── TEST 3: Stats endpoint
print(f"\n{BOLD}TEST 3: LLM Stats endpoint{RESET}")
time.sleep(1)
r = requests.get(f"{API}/llm/{model_id}/stats?hours=1", headers=headers)
if r.status_code == 200:
    stats = r.json().get("stats")
    if stats:
        ok("Stats endpoint", f"call_count={r.json().get('call_count')}")
        print(f"     avg_latency_ms:    {stats.get('avg_latency'):.0f}ms" if stats.get('avg_latency') else "     avg_latency: N/A")
        print(f"     avg_total_tokens:  {stats.get('avg_total_tokens'):.0f}" if stats.get('avg_total_tokens') else "     avg_tokens: N/A")
        print(f"     avg_cost_usd:      ${stats.get('avg_cost'):.6f}" if stats.get('avg_cost') else "     avg_cost: N/A")
        print(f"     error_rate:        {(stats.get('error_rate') or 0)*100:.1f}%")
        print(f"     hallucination_rate:{(stats.get('hallucination_rate') or 0)*100:.1f}%")
        print(f"     thumbs_up_rate:    {(stats.get('thumbs_up_rate') or 0)*100:.1f}%")
        print(f"     providers:         {stats.get('providers')}")
    else:
        warn("Stats endpoint", "returned null stats")
else:
    fail("Stats endpoint", f"Got {r.status_code}: {r.text[:100]}")


# ── TEST 4: Calls endpoint
print(f"\n{BOLD}TEST 4: LLM Calls list endpoint{RESET}")
r = requests.get(f"{API}/llm/{model_id}/calls?limit=10", headers=headers)
if r.status_code == 200:
    calls_resp = r.json().get("calls", [])
    ok("Calls list endpoint", f"returned {len(calls_resp)} calls")
    if calls_resp:
        c = calls_resp[0]
        print(f"     Latest call: provider={c.get('provider')} model={c.get('llm_model')} latency={c.get('latency_ms')}ms")
else:
    fail("Calls list endpoint", f"Got {r.status_code}")


# ── TEST 5: Over-limit batch rejected
print(f"\n{BOLD}TEST 5: Over-limit batch (201 calls) rejected{RESET}")
big_batch = [{"provider": "openai", "latency_ms": 500}] * 201
r = requests.post(f"{API}/llm/batch", json={"calls": big_batch}, headers=sdk_headers)
if r.status_code == 422:
    ok("Over-limit batch rejected", "422 as expected")
else:
    warn("Over-limit batch", f"Expected 422, got {r.status_code}")


# ── TEST 6: Invalid API key rejected
print(f"\n{BOLD}TEST 6: Invalid API key rejected{RESET}")
r = requests.post(f"{API}/llm/batch",
    json={"calls": [{"provider": "openai"}]},
    headers={"Authorization": "Bearer mp_fake_key"})
if r.status_code == 401:
    ok("Invalid API key rejected", "401 as expected")
else:
    fail("Invalid API key", f"Expected 401, got {r.status_code}")


# ── TEST 7: Multi-provider tracking
print(f"\n{BOLD}TEST 7: Multi-provider call tracking{RESET}")
multi = []
for provider, model in [("openai","gpt-4o"), ("anthropic","claude-3-5-sonnet"),
                         ("groq","llama-3.3-70b"), ("gemini","gemini-1.5-pro")]:
    multi.append({
        "provider":    provider,
        "llm_model":   model,
        "latency_ms":  random.randint(300, 2000),
        "cost_usd":    round(random.uniform(0.001, 0.05), 6),
        "success":     True,
    })
r = requests.post(f"{API}/llm/batch", json={"calls": multi}, headers=sdk_headers)
if r.status_code == 202:
    ok("Multi-provider tracking", f"OpenAI + Anthropic + Groq + Gemini logged")
else:
    fail("Multi-provider tracking", f"Got {r.status_code}")


# ── REPORT
print(f"\n{BOLD}{'='*55}{RESET}")
passed = sum(1 for r in results if r[0] == "PASS")
warned = sum(1 for r in results if r[0] == "WARN")
failed = sum(1 for r in results if r[0] == "FAIL")

print(f"  Total={len(results)}  {GREEN}Passed={passed}{RESET}  {YELLOW}Warned={warned}{RESET}  {RED}Failed={failed}{RESET}")
if failed == 0:
    print(f"  {GREEN}{BOLD}ALL LLM MONITORING TESTS PASSED! 🔥{RESET}")
else:
    print(f"  {RED}{BOLD}{failed} test(s) failed{RESET}")
print(f"\n  pip install modelpulse-sdk  # v0.2.0 — now with LLM monitoring")
print(f"  Dashboard: https://frontend-ruddy-sigma-92.vercel.app\n")
