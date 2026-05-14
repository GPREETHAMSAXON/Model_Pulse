'use strict';

const LlmCall   = require('../models/LlmCall');
const LlmSnapshot = require('../models/LlmSnapshot');
const { Model }   = require('../models');
const Anthropic   = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// TTL by plan
const RETENTION = { hobby: 7, pro: 90, team: 365 };

// ── POST /api/v1/llm/batch
exports.ingestBatch = async (req, res) => {
  try {
    const { calls } = req.body;
    const { model_id, user_id, plan } = req.sdkAuth;

    const retentionDays = RETENTION[plan] || 7;
    const expiresAt = new Date(Date.now() + retentionDays * 86400 * 1000);

    const docs = calls.map(c => ({
      model_id,
      user_id,
      provider:          c.provider || 'unknown',
      llm_model:         c.llm_model || null,
      prompt:            c.store_prompt ? c.prompt : null,
      completion:        c.store_completion ? c.completion : null,
      prompt_preview:    c.prompt ? c.prompt.slice(0, 200) : null,
      system_prompt:     c.system_prompt || null,
      prompt_tokens:     c.prompt_tokens || null,
      completion_tokens: c.completion_tokens || null,
      total_tokens:      (c.prompt_tokens && c.completion_tokens)
                           ? c.prompt_tokens + c.completion_tokens
                           : c.total_tokens || null,
      cost_usd:          c.cost_usd || null,
      latency_ms:        c.latency_ms || null,
      ttft_ms:           c.ttft_ms || null,
      quality_score:     c.quality_score || null,
      thumbs_up:         c.thumbs_up !== undefined ? c.thumbs_up : null,
      hallucination:     c.hallucination || false,
      toxicity_score:    c.toxicity_score || null,
      tags:              c.tags || [],
      session_id:        c.session_id || null,
      user_feedback:     c.user_feedback || null,
      error:             c.error || null,
      success:           c.error ? false : true,
      expires_at:        expiresAt,
    }));

    await LlmCall.insertMany(docs, { ordered: false });

    return res.status(202).json({
      accepted: docs.length,
      message:  'LLM calls ingested successfully',
    });
  } catch (err) {
    console.error('[llm] ingestBatch error:', err.message);
    return res.status(500).json({ error: 'Failed to ingest LLM calls' });
  }
};

// ── GET /api/v1/llm/:modelId/snapshots
exports.getSnapshots = async (req, res) => {
  try {
    const { modelId } = req.params;
    const limit = parseInt(req.query.limit) || 24;

    const snapshots = await LlmSnapshot.find({ model_id: modelId })
      .sort({ computed_at: -1 })
      .limit(limit);

    return res.json({ snapshots });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// ── GET /api/v1/llm/:modelId/calls
exports.getCalls = async (req, res) => {
  try {
    const { modelId } = req.params;
    const limit  = parseInt(req.query.limit)  || 50;
    const before = req.query.before ? new Date(req.query.before) : new Date();

    const calls = await LlmCall.find({
      model_id:  modelId,
      timestamp: { $lt: before },
    })
    .sort({ timestamp: -1 })
    .limit(limit)
    .select('-prompt -completion'); // Don't return full text by default

    return res.json({ calls, count: calls.length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// ── GET /api/v1/llm/:modelId/stats
exports.getStats = async (req, res) => {
  try {
    const { modelId } = req.params;
    const hours = parseInt(req.query.hours) || 24;
    const since = new Date(Date.now() - hours * 3600 * 1000);

    const calls = await LlmCall.find({
      model_id:  modelId,
      timestamp: { $gte: since },
    });

    if (!calls.length) {
      return res.json({ message: 'No LLM calls in window', stats: null });
    }

    const stats = computeStats(calls);
    return res.json({ stats, call_count: calls.length, window_hours: hours });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// ── POST /api/v1/llm/:modelId/feedback
exports.submitFeedback = async (req, res) => {
  try {
    const { call_id, thumbs_up, quality_score, feedback, hallucination } = req.body;

    const updated = await LlmCall.findByIdAndUpdate(call_id, {
      $set: {
        thumbs_up,
        quality_score: quality_score !== undefined ? quality_score : null,
        user_feedback: feedback || null,
        hallucination: hallucination || false,
      }
    }, { new: true });

    if (!updated) return res.status(404).json({ error: 'Call not found' });
    return res.json({ message: 'Feedback recorded', call_id });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// ── Internal: compute LLM snapshot (called by cron)
exports.computeLlmSnapshot = async (modelId) => {
  try {
    const windowEnd   = new Date();
    const windowStart = new Date(windowEnd - 60 * 60 * 1000); // last 1 hour

    const calls = await LlmCall.find({
      model_id:  modelId,
      timestamp: { $gte: windowStart, $lte: windowEnd },
    });

    if (calls.length < 3) {
      console.log(`[llm-cron] ${modelId}: only ${calls.length} calls — skipping snapshot`);
      return null;
    }

    // Get previous window for trend comparison
    const prevWindowStart = new Date(windowStart - 60 * 60 * 1000);
    const prevCalls = await LlmCall.find({
      model_id:  modelId,
      timestamp: { $gte: prevWindowStart, $lt: windowStart },
    });

    const stats    = computeStats(calls);
    const prevStats = prevCalls.length >= 3 ? computeStats(prevCalls) : null;

    const health    = determineHealth(stats, prevStats);
    const diagnosis = await generateDiagnosis(modelId, stats, prevStats, health, calls.length);

    const snapshot = await LlmSnapshot.create({
      model_id:              modelId,
      window_start:          windowStart,
      window_end:            windowEnd,
      call_count:            calls.length,
      avg_prompt_tokens:     stats.avg_prompt_tokens,
      avg_completion_tokens: stats.avg_completion_tokens,
      avg_total_tokens:      stats.avg_total_tokens,
      token_trend:           getTrend(stats.avg_total_tokens, prevStats?.avg_total_tokens),
      total_cost_usd:        stats.total_cost,
      avg_cost_usd:          stats.avg_cost,
      cost_trend:            getTrend(stats.avg_cost, prevStats?.avg_cost),
      avg_latency_ms:        stats.avg_latency,
      p95_latency_ms:        stats.p95_latency,
      latency_trend:         getTrend(stats.avg_latency, prevStats?.avg_latency),
      avg_quality_score:     stats.avg_quality,
      thumbs_up_rate:        stats.thumbs_up_rate,
      hallucination_rate:    stats.hallucination_rate,
      error_rate:            stats.error_rate,
      quality_trend:         getQualityTrend(stats.avg_quality, prevStats?.avg_quality),
      avg_prompt_length:     stats.avg_prompt_length,
      prompt_length_trend:   getTrend(stats.avg_prompt_length, prevStats?.avg_prompt_length),
      overall_health:        health,
      ai_diagnosis:          diagnosis,
    });

    console.log(`[llm-cron] ✓ ${modelId} → ${health} (${calls.length} calls)`);
    return snapshot;
  } catch (err) {
    console.error(`[llm-cron] Error for ${modelId}:`, err.message);
    return null;
  }
};

// ── Helpers

function computeStats(calls) {
  const n = calls.length;

  const avgOrNull = (arr) => {
    const valid = arr.filter(v => v !== null && v !== undefined);
    return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
  };

  const latencies = calls.map(c => c.latency_ms).filter(Boolean).sort((a, b) => a - b);
  const p95_latency = latencies.length
    ? latencies[Math.floor(latencies.length * 0.95)] : null;

  const qualityScores  = calls.map(c => c.quality_score).filter(v => v !== null);
  const thumbsUps      = calls.filter(c => c.thumbs_up !== null);
  const hallucinations = calls.filter(c => c.hallucination === true);
  const errors         = calls.filter(c => !c.success);
  const costs          = calls.map(c => c.cost_usd).filter(Boolean);
  const promptLengths  = calls.map(c => c.prompt_preview?.length || 0);

  return {
    avg_prompt_tokens:     avgOrNull(calls.map(c => c.prompt_tokens)),
    avg_completion_tokens: avgOrNull(calls.map(c => c.completion_tokens)),
    avg_total_tokens:      avgOrNull(calls.map(c => c.total_tokens)),
    total_cost:            costs.reduce((a, b) => a + b, 0) || null,
    avg_cost:              avgOrNull(costs),
    avg_latency:           avgOrNull(latencies),
    p95_latency,
    avg_quality:           avgOrNull(qualityScores),
    thumbs_up_rate:        thumbsUps.length ? thumbsUps.filter(c => c.thumbs_up).length / thumbsUps.length : null,
    hallucination_rate:    n ? hallucinations.length / n : null,
    error_rate:            n ? errors.length / n : null,
    avg_prompt_length:     avgOrNull(promptLengths),
    providers:             [...new Set(calls.map(c => c.provider))],
  };
}

function getTrend(current, previous) {
  if (!current || !previous) return 'stable';
  const change = (current - previous) / previous;
  if (change > 0.15)  return 'increasing';
  if (change < -0.15) return 'decreasing';
  return 'stable';
}

function getQualityTrend(current, previous) {
  if (!current || !previous) return 'stable';
  const change = (current - previous) / previous;
  if (change > 0.05)  return 'improving';
  if (change < -0.05) return 'degrading';
  return 'stable';
}

function determineHealth(stats, prevStats) {
  // Critical conditions
  if (stats.error_rate > 0.1)         return 'critical'; // >10% errors
  if (stats.hallucination_rate > 0.05) return 'critical'; // >5% hallucinations
  if (stats.avg_latency > 10000)       return 'critical'; // >10s avg latency
  if (prevStats && stats.avg_cost && prevStats.avg_cost) {
    const costIncrease = (stats.avg_cost - prevStats.avg_cost) / prevStats.avg_cost;
    if (costIncrease > 0.5) return 'critical'; // >50% cost spike
  }

  // Warning conditions
  if (stats.error_rate > 0.03)         return 'warning'; // >3% errors
  if (stats.hallucination_rate > 0.02) return 'warning'; // >2% hallucinations
  if (stats.avg_latency > 5000)        return 'warning'; // >5s avg latency
  if (stats.thumbs_up_rate !== null && stats.thumbs_up_rate < 0.6) return 'warning';
  if (prevStats && stats.avg_total_tokens && prevStats.avg_total_tokens) {
    const tokenIncrease = (stats.avg_total_tokens - prevStats.avg_total_tokens) / prevStats.avg_total_tokens;
    if (tokenIncrease > 0.3) return 'warning'; // >30% token increase
  }

  return 'healthy';
}

async function generateDiagnosis(modelId, stats, prevStats, health, callCount) {
  try {
    const prompt = `You are an LLM monitoring expert. Analyze this LLM performance snapshot and write a concise 2-3 sentence plain English diagnosis.

Model ID: ${modelId}
Call count (last hour): ${callCount}
Health status: ${health}

Current metrics:
- Avg latency: ${stats.avg_latency ? stats.avg_latency.toFixed(0) + 'ms' : 'N/A'}
- Avg total tokens: ${stats.avg_total_tokens ? stats.avg_total_tokens.toFixed(0) : 'N/A'}
- Avg cost per call: ${stats.avg_cost ? '$' + stats.avg_cost.toFixed(6) : 'N/A'}
- Error rate: ${stats.error_rate !== null ? (stats.error_rate * 100).toFixed(1) + '%' : 'N/A'}
- Hallucination rate: ${stats.hallucination_rate !== null ? (stats.hallucination_rate * 100).toFixed(1) + '%' : 'N/A'}
- Thumbs-up rate: ${stats.thumbs_up_rate !== null ? (stats.thumbs_up_rate * 100).toFixed(1) + '%' : 'N/A'}
- Quality score: ${stats.avg_quality !== null ? stats.avg_quality.toFixed(2) : 'N/A'}
- Token trend: ${getTrend(stats.avg_total_tokens, prevStats?.avg_total_tokens)}
- Cost trend: ${getTrend(stats.avg_cost, prevStats?.avg_cost)}

Write a clear, actionable diagnosis. If healthy, confirm stability. If warning/critical, identify the issue and recommend a specific action. Use **bold** for key findings. No bullet points.`;

    const message = await anthropic.messages.create({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 300,
      messages:   [{ role: 'user', content: prompt }],
    });

    return message.content[0].text;
  } catch (err) {
    console.error('[llm] Claude diagnosis failed:', err.message);
    return `LLM model processed ${callCount} calls in the last hour with ${health} health status.`;
  }
}
