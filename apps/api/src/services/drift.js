'use strict';

const axios         = require('axios');
const Anthropic     = require('@anthropic-ai/sdk');
const { Model, AlertRule } = require('../models');
const Prediction    = require('../models/Prediction');
const Baseline      = require('../models/Baseline');
const DriftSnapshot = require('../models/DriftSnapshot');
const AlertEvent    = require('../models/AlertEvent');
const alertService  = require('./alert');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const ML_ENGINE_URL    = process.env.ML_ENGINE_URL    || 'http://localhost:8000';
const ML_ENGINE_SECRET = process.env.ML_ENGINE_SECRET || 'internal_service_secret';

const BASELINE_SIZE           = 80;
const MIN_CURRENT_PREDICTIONS = 5;


async function runDriftJob() {
  console.log(`[drift-cron] Starting drift job at ${new Date().toISOString()}`);

  const models = await Model.findAll({
    where: { status: 'active' },
    include: [{ model: AlertRule, as: 'AlertRules' }],
  });

  console.log(`[drift-cron] Processing ${models.length} active model(s)`);
  await Promise.allSettled(models.map(processModel));
  console.log(`[drift-cron] Drift job complete`);
}


async function processModel(model) {
  try {
    console.log(`[drift-cron] Processing model: ${model.name} (${model.id})`);

    const baselineDoc = await Baseline.findOne({ model_id: model.id });
    if (!baselineDoc || !baselineDoc.is_ready) {
      console.log(`[drift-cron] Skipping ${model.name} — baseline not ready yet`);
      return;
    }

    const allPredictions = await Prediction.find({ model_id: model.id })
      .sort({ timestamp: 1 })
      .lean();

    const total = allPredictions.length;
    console.log(`[drift-cron] ${model.name} has ${total} total predictions`);

    if (total < BASELINE_SIZE + MIN_CURRENT_PREDICTIONS) {
      console.log(`[drift-cron] Skipping — need at least ${BASELINE_SIZE + MIN_CURRENT_PREDICTIONS}, have ${total}`);
      return;
    }

    const baseline = allPredictions.slice(0, BASELINE_SIZE);
    const current  = allPredictions.slice(BASELINE_SIZE);

    console.log(`[drift-cron] Baseline: ${baseline.length} | Current window: ${current.length}`);

    const driftResult = await callMlEngine(model, baseline, current);
    if (!driftResult) return;

    const diagnosis = await generateDiagnosis(model, driftResult);
    console.log(`[drift-cron] Diagnosis: ${diagnosis?.slice(0, 80)}...`);

    const windowStart = new Date(allPredictions[BASELINE_SIZE].timestamp);
    const windowEnd   = new Date(allPredictions[total - 1].timestamp);

    // Build snapshot doc explicitly — avoid Map type issues
    const snapshotDoc = {
      model_id:         model.id,
      computed_at:      new Date(),
      window_start:     windowStart,
      window_end:       windowEnd,
      prediction_count: current.length,
      feature_drift:    JSON.parse(JSON.stringify(driftResult.feature_drift)),
      prediction_drift: JSON.parse(JSON.stringify(driftResult.prediction_drift)),
      overall_health:   driftResult.overall_health,
      ai_diagnosis:     diagnosis || null,
      alert_fired:      false,
    };

    console.log(`[drift-cron] Saving snapshot...`);
    const snapshot = await DriftSnapshot.create(snapshotDoc);
    console.log(`[drift-cron] ✓ Snapshot saved: ${snapshot._id}`);

    const alertRules = model.AlertRules || [];
    if (alertRules.length > 0) {
      const alertFired = await checkAndFireAlerts(model, snapshot, alertRules, driftResult);
      if (alertFired) {
        await DriftSnapshot.findByIdAndUpdate(snapshot._id, { alert_fired: true });
      }
    }

    console.log(`[drift-cron] ✓ ${model.name} → ${driftResult.overall_health}`);
  } catch (err) {
    console.error(`[drift-cron] ✗ Failed for model ${model.id}:`, err.message);
    console.error(err.stack);
  }
}


async function callMlEngine(model, baseline, current) {
  try {
    const format = (preds) => preds.map((p) => ({
      input_features: p.input_features,
      prediction:     p.prediction,
      confidence:     p.confidence,
      timestamp:      p.timestamp,
    }));

    const { data } = await axios.post(
      `${ML_ENGINE_URL}/drift/compute`,
      {
        model_id:  model.id,
        task_type: model.task_type,
        baseline:  format(baseline),
        current:   format(current),
      },
      {
        headers: {
          'Content-Type':      'application/json',
          'x-internal-secret': ML_ENGINE_SECRET,
        },
        timeout: 30000,
      }
    );

    return data;
  } catch (err) {
    console.error(`[drift-cron] ML engine call failed:`, err.message);
    return null;
  }
}


async function generateDiagnosis(model, driftResult) {
  try {
    const driftedFeatures = Object.entries(driftResult.feature_drift)
      .filter(([, v]) => v.drifted)
      .map(([name, v]) => `${name} (PSI: ${v.psi?.toFixed(3)}, KS p-value: ${v.ks_pvalue?.toFixed(4)})`)
      .join(', ');

    const prompt = `You are an ML monitoring assistant. Analyze this drift report for a ${model.task_type} model named "${model.name}" and write a concise 2-3 sentence plain-English diagnosis that a non-technical user can understand.

Drift Report:
- Overall health: ${driftResult.overall_health}
- Prediction count in window: ${driftResult.prediction_count}
- Drifted features: ${driftedFeatures || 'none'}
- Prediction drift PSI: ${driftResult.prediction_drift?.psi?.toFixed(3) ?? 'N/A'}

Rules:
- Be specific about which features drifted and what that means
- Suggest one concrete action the user should take
- Never use jargon like PSI or KS — translate to plain English
- Keep it under 60 words`;

    const message = await anthropic.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 150,
      messages:   [{ role: 'user', content: prompt }],
    });

    return message.content[0]?.text || null;
  } catch (err) {
    console.error(`[drift-cron] Claude diagnosis failed:`, err.message);
    return null;
  }
}


async function checkAndFireAlerts(model, snapshot, rules, driftResult) {
  let anyFired = false;

  for (const rule of rules) {
    if (!rule.enabled) continue;

    let shouldFire = false;
    let severity   = 'warning';

    if (rule.trigger_type === 'drift') {
      const maxPsi = Math.max(
        ...Object.values(driftResult.feature_drift).map((f) => f.psi || 0),
        driftResult.prediction_drift?.psi || 0
      );
      shouldFire = maxPsi >= rule.threshold;
      severity   = maxPsi >= 0.20 ? 'critical' : 'warning';
    }

    if (rule.trigger_type === 'accuracy_drop') {
      shouldFire = driftResult.overall_health === 'critical';
      severity   = 'critical';
    }

    if (!shouldFire) continue;

    const message = snapshot.ai_diagnosis ||
      `Model "${model.name}" has ${driftResult.overall_health} drift detected. Immediate review recommended.`;

    const alertEvent = await AlertEvent.create({
      model_id:          model.id,
      rule_id:           rule.id,
      snapshot_id:       snapshot._id,
      severity,
      message,
      channels_notified: [],
      acknowledged:      false,
      fired_at:          new Date(),
    });

    const notified = await alertService.send({ rule, model, message, severity, snapshotId: snapshot._id });
    await AlertEvent.findByIdAndUpdate(alertEvent._id, { channels_notified: notified });

    anyFired = true;
    console.log(`[drift-cron] Alert fired for ${model.name} via ${notified.join(', ') || 'none'}`);
  }

  return anyFired;
}


module.exports = { runDriftJob };
