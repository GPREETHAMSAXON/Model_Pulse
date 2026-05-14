'use strict';

const LlmCall    = require('../models/LlmCall');
const { Model }  = require('../models');
const { computeLlmSnapshot } = require('../controllers/llmController');

async function runLlmJob() {
  const start = new Date();
  console.log(`[llm-cron] Starting LLM job at ${start.toISOString()}`);

  try {
    // Find all models that have LLM calls in the last 2 hours
    const since = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const activeLlmModels = await LlmCall.distinct('model_id', {
      timestamp: { $gte: since }
    });

    console.log(`[llm-cron] Processing ${activeLlmModels.length} LLM model(s)`);

    for (const modelId of activeLlmModels) {
      try {
        await computeLlmSnapshot(modelId);
      } catch (err) {
        console.error(`[llm-cron] Failed for ${modelId}:`, err.message);
      }
    }

    console.log(`[llm-cron] LLM job complete`);
  } catch (err) {
    console.error('[llm-cron] Job error:', err.message);
  }
}

module.exports = { runLlmJob };
