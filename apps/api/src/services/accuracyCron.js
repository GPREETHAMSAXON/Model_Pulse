'use strict';

const GroundTruth = require('../models/GroundTruth');
const { computeAccuracySnapshot } = require('../controllers/groundTruthController');

async function runAccuracyJob() {
  const start = new Date();
  console.log(`[accuracy-cron] Starting accuracy job at ${start.toISOString()}`);

  try {
    // Find models with ground truth labels in last 25 hours
    const since = new Date(Date.now() - 25 * 60 * 60 * 1000);
    const activeModels = await GroundTruth.distinct('model_id', {
      timestamp: { $gte: since }
    });

    console.log(`[accuracy-cron] Processing ${activeModels.length} model(s)`);

    for (const modelId of activeModels) {
      try {
        await computeAccuracySnapshot(modelId);
      } catch (err) {
        console.error(`[accuracy-cron] Failed for ${modelId}:`, err.message);
      }
    }

    console.log('[accuracy-cron] Accuracy job complete');
  } catch (err) {
    console.error('[accuracy-cron] Job error:', err.message);
  }
}

module.exports = { runAccuracyJob };
