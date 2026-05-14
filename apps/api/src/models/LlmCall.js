'use strict';

const mongoose = require('mongoose');

/**
 * LlmCall — stores every LLM API call logged via the SDK.
 * Analogous to Prediction for traditional ML, but captures
 * LLM-specific signals: prompts, completions, token usage, cost, quality.
 *
 * Supports: OpenAI, Anthropic, Gemini, Mistral, Groq, any provider.
 */
const llmCallSchema = new mongoose.Schema({
  model_id: { type: String, required: true, index: true },
  user_id:  { type: String, required: true, index: true },

  // ── Provider info
  provider:   { type: String, default: 'unknown' }, // openai | anthropic | gemini | groq | other
  llm_model:  { type: String, default: null },       // gpt-4o | claude-3-5-sonnet | gemini-pro

  // ── Prompt & completion
  prompt:          { type: String, default: null },   // full prompt text (optional — privacy)
  completion:      { type: String, default: null },   // full response text (optional)
  prompt_preview:  { type: String, default: null },   // first 200 chars (always stored)
  system_prompt:   { type: String, default: null },   // system message if present

  // ── Token usage
  prompt_tokens:     { type: Number, default: null },
  completion_tokens: { type: Number, default: null },
  total_tokens:      { type: Number, default: null },

  // ── Cost (USD)
  cost_usd: { type: Number, default: null },

  // ── Latency
  latency_ms:       { type: Number, default: null },  // total API call time
  ttft_ms:          { type: Number, default: null },  // time to first token

  // ── Quality signals
  quality_score:    { type: Number, min: 0, max: 1, default: null }, // 0-1 user-defined or auto
  thumbs_up:        { type: Boolean, default: null },  // user feedback
  hallucination:    { type: Boolean, default: null },  // flagged hallucination
  toxicity_score:   { type: Number, min: 0, max: 1, default: null },

  // ── Tags & metadata
  tags:          { type: [String], default: [] },
  session_id:    { type: String, default: null },
  user_feedback: { type: String, default: null },
  error:         { type: String, default: null },   // error message if call failed
  success:       { type: Boolean, default: true },

  timestamp:  { type: Date, default: Date.now, index: true },
  expires_at: { type: Date, index: { expireAfterSeconds: 0 } },
}, {
  collection: 'llm_calls',
  timestamps: false,
});

llmCallSchema.index({ model_id: 1, timestamp: -1 });
llmCallSchema.index({ model_id: 1, provider: 1, timestamp: -1 });

module.exports = mongoose.model('LlmCall', llmCallSchema);
