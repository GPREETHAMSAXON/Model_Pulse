'use strict';

const mongoose = require('mongoose');

/**
 * LlmSnapshot — hourly computed health snapshot for an LLM model.
 * Analogous to DriftSnapshot for traditional ML.
 * Tracks: token trends, cost trends, quality degradation, latency drift,
 * prompt length drift, and AI-generated diagnosis.
 */
const llmSnapshotSchema = new mongoose.Schema({
  model_id:    { type: String, required: true, index: true },
  computed_at: { type: Date, default: Date.now, index: true },
  window_start: { type: Date, required: true },
  window_end:   { type: Date, required: true },
  call_count:   { type: Number, default: 0 },

  // ── Token metrics
  avg_prompt_tokens:     { type: Number, default: null },
  avg_completion_tokens: { type: Number, default: null },
  avg_total_tokens:      { type: Number, default: null },
  token_trend:           { type: String, enum: ['stable', 'increasing', 'decreasing'], default: 'stable' },

  // ── Cost metrics
  total_cost_usd:  { type: Number, default: null },
  avg_cost_usd:    { type: Number, default: null },
  cost_trend:      { type: String, enum: ['stable', 'increasing', 'decreasing'], default: 'stable' },

  // ── Latency metrics
  avg_latency_ms: { type: Number, default: null },
  p95_latency_ms: { type: Number, default: null },
  latency_trend:  { type: String, enum: ['stable', 'increasing', 'decreasing'], default: 'stable' },

  // ── Quality metrics
  avg_quality_score:  { type: Number, default: null },
  thumbs_up_rate:     { type: Number, default: null }, // 0-1
  hallucination_rate: { type: Number, default: null }, // 0-1
  error_rate:         { type: Number, default: null }, // 0-1
  quality_trend:      { type: String, enum: ['stable', 'improving', 'degrading'], default: 'stable' },

  // ── Prompt drift
  avg_prompt_length:   { type: Number, default: null },
  prompt_length_trend: { type: String, enum: ['stable', 'increasing', 'decreasing'], default: 'stable' },

  // ── Overall health
  overall_health: {
    type: String,
    enum: ['healthy', 'warning', 'critical'],
    default: 'healthy',
  },

  ai_diagnosis: { type: String, default: null },
  alert_fired:  { type: Boolean, default: false },
}, {
  collection: 'llm_snapshots',
  timestamps: false,
});

llmSnapshotSchema.index({ model_id: 1, computed_at: -1 });

module.exports = mongoose.model('LlmSnapshot', llmSnapshotSchema);
