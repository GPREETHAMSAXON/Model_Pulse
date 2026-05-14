'use strict';

const GroundTruth      = require('../models/GroundTruth');
const AccuracySnapshot = require('../models/AccuracySnapshot');
const Prediction       = require('../models/Prediction');
const Anthropic        = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─────────────────────────────────────────────
// POST /api/v1/ground-truth/batch
// User uploads actual labels for past predictions
// ─────────────────────────────────────────────
exports.uploadBatch = async (req, res) => {
  try {
    const { labels } = req.body;
    const model_id   = req.model.id;
    const user_id    = req.user_id;
    const task_type  = req.model.task_type || 'classification';

    const docs = [];

    for (const label of labels) {
      const doc = {
        model_id,
        user_id,
        actual:      label.actual,
        task_type,
        external_id: label.external_id || null,
        timestamp:   label.timestamp ? new Date(label.timestamp) : new Date(),
      };

      // Try to match to a prediction
      let predicted    = null;
      let confidence   = null;
      let predictionId = null;

      if (label.prediction_id) {
        // Direct match by prediction _id
        const pred = await Prediction.findById(label.prediction_id).select('prediction confidence');
        if (pred) {
          predicted    = pred.prediction;
          confidence   = pred.confidence;
          predictionId = pred._id;
        }
      } else if (label.external_id) {
        // Match by external_id on the prediction
        const pred = await Prediction.findOne({
          model_id,
          'input_features.id': label.external_id,
        }).select('prediction confidence');
        if (pred) {
          predicted    = pred.prediction;
          confidence   = pred.confidence;
          predictionId = pred._id;
        }
      }

      doc.predicted     = label.predicted || predicted;
      doc.confidence    = label.confidence || confidence;
      doc.prediction_id = predictionId;

      // Compute correctness
      if (doc.predicted !== null && doc.predicted !== undefined) {
        if (task_type === 'classification') {
          doc.correct = String(doc.predicted) === String(doc.actual);
        } else {
          // Regression — compute absolute error
          const pred_val   = parseFloat(doc.predicted);
          const actual_val = parseFloat(doc.actual);
          if (!isNaN(pred_val) && !isNaN(actual_val)) {
            doc.absolute_error = Math.abs(pred_val - actual_val);
            doc.correct        = doc.absolute_error < (actual_val * 0.1); // within 10%
          }
        }
      }

      docs.push(doc);
    }

    await GroundTruth.insertMany(docs, { ordered: false });

    // Trigger accuracy computation asynchronously
    computeAccuracySnapshot(model_id).catch(err =>
      console.error('[ground-truth] Snapshot compute failed:', err.message)
    );

    return res.status(202).json({
      accepted: docs.length,
      message:  'Ground truth labels uploaded successfully',
    });
  } catch (err) {
    console.error('[ground-truth] uploadBatch error:', err.message);
    return res.status(500).json({ error: 'Failed to upload ground truth', detail: err.message });
  }
};

// ─────────────────────────────────────────────
// GET /api/v1/ground-truth/:modelId/accuracy
// Real-time accuracy metrics
// ─────────────────────────────────────────────
exports.getAccuracy = async (req, res) => {
  try {
    const { modelId } = req.params;
    const hours = parseInt(req.query.hours) || 24;
    const since = new Date(Date.now() - hours * 3600 * 1000);

    const labels = await GroundTruth.find({
      model_id:  modelId,
      timestamp: { $gte: since },
    });

    if (!labels.length) {
      return res.json({
        message:  'No ground truth labels in window',
        accuracy: null,
        count:    0,
      });
    }

    const metrics = computeMetrics(labels);
    return res.json({
      ...metrics,
      count:        labels.length,
      window_hours: hours,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// ─────────────────────────────────────────────
// GET /api/v1/ground-truth/:modelId/snapshots
// Historical accuracy snapshots
// ─────────────────────────────────────────────
exports.getSnapshots = async (req, res) => {
  try {
    const { modelId } = req.params;
    const limit = parseInt(req.query.limit) || 30;

    const snapshots = await AccuracySnapshot.find({ model_id: modelId })
      .sort({ computed_at: -1 })
      .limit(limit);

    return res.json({ snapshots });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// ─────────────────────────────────────────────
// GET /api/v1/ground-truth/:modelId/confusion
// Confusion matrix
// ─────────────────────────────────────────────
exports.getConfusionMatrix = async (req, res) => {
  try {
    const { modelId } = req.params;
    const hours = parseInt(req.query.hours) || 24;
    const since = new Date(Date.now() - hours * 3600 * 1000);

    const labels = await GroundTruth.find({
      model_id:  modelId,
      timestamp: { $gte: since },
      correct:   { $ne: null },
    });

    if (!labels.length) {
      return res.json({ matrix: null, classes: [], count: 0 });
    }

    // Build confusion matrix
    const classes = [...new Set([
      ...labels.map(l => String(l.actual)),
      ...labels.map(l => String(l.predicted)).filter(Boolean),
    ])].sort();

    const matrix = {};
    classes.forEach(actual => {
      matrix[actual] = {};
      classes.forEach(pred => { matrix[actual][pred] = 0; });
    });

    labels.forEach(l => {
      if (l.predicted !== null && l.predicted !== undefined) {
        const a = String(l.actual);
        const p = String(l.predicted);
        if (matrix[a] && matrix[a][p] !== undefined) {
          matrix[a][p]++;
        }
      }
    });

    return res.json({ matrix, classes, count: labels.length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

// ─────────────────────────────────────────────
// Internal: compute accuracy snapshot (called by cron + on upload)
// ─────────────────────────────────────────────
async function computeAccuracySnapshot(modelId) {
  try {
    const windowEnd   = new Date();
    const windowStart = new Date(windowEnd - 24 * 60 * 60 * 1000); // last 24 hours

    const labels = await GroundTruth.find({
      model_id:  modelId,
      timestamp: { $gte: windowStart, $lte: windowEnd },
    });

    if (labels.length < 5) return null;

    // Get previous window
    const prevStart = new Date(windowStart - 24 * 60 * 60 * 1000);
    const prevLabels = await GroundTruth.find({
      model_id:  modelId,
      timestamp: { $gte: prevStart, $lt: windowStart },
    });

    const metrics     = computeMetrics(labels);
    const prevMetrics = prevLabels.length >= 5 ? computeMetrics(prevLabels) : null;

    const health    = determineHealth(metrics, prevMetrics);
    const trend     = getAccuracyTrend(metrics.accuracy, prevMetrics?.accuracy);
    const diagnosis = await generateDiagnosis(modelId, metrics, prevMetrics, health, labels.length);

    const snapshot = await AccuracySnapshot.create({
      model_id:            modelId,
      window_start:        windowStart,
      window_end:          windowEnd,
      labeled_predictions: labels.length,
      accuracy:            metrics.accuracy,
      precision:           metrics.precision,
      recall:              metrics.recall,
      f1_score:            metrics.f1_score,
      mae:                 metrics.mae,
      rmse:                metrics.rmse,
      confusion_matrix:    metrics.confusion_matrix,
      class_distribution:  metrics.class_distribution,
      accuracy_trend:      trend,
      overall_health:      health,
      ai_diagnosis:        diagnosis,
    });

    console.log(`[accuracy-cron] ✓ ${modelId} → acc=${metrics.accuracy?.toFixed(3)} health=${health}`);
    return snapshot;
  } catch (err) {
    console.error(`[accuracy-cron] Error for ${modelId}:`, err.message);
    return null;
  }
}

exports.computeAccuracySnapshot = computeAccuracySnapshot;

// ─────────────────────────────────────────────
// Metric computation helpers
// ─────────────────────────────────────────────
function computeMetrics(labels) {
  const taskType = labels[0]?.task_type || 'classification';

  if (taskType === 'regression') {
    return computeRegressionMetrics(labels);
  }
  return computeClassificationMetrics(labels);
}

function computeClassificationMetrics(labels) {
  const withPredictions = labels.filter(l => l.predicted !== null && l.predicted !== undefined);
  if (!withPredictions.length) return { accuracy: null };

  const correct  = withPredictions.filter(l => l.correct === true).length;
  const accuracy = correct / withPredictions.length;

  // Get all classes
  const classes = [...new Set([
    ...withPredictions.map(l => String(l.actual)),
    ...withPredictions.map(l => String(l.predicted)),
  ])].sort();

  // Build confusion matrix
  const cm = {};
  classes.forEach(a => { cm[a] = {}; classes.forEach(p => { cm[a][p] = 0; }); });
  withPredictions.forEach(l => {
    const a = String(l.actual);
    const p = String(l.predicted);
    if (cm[a]?.[p] !== undefined) cm[a][p]++;
  });

  // Class distribution
  const dist = {};
  withPredictions.forEach(l => {
    const k = String(l.actual);
    dist[k] = (dist[k] || 0) + 1;
  });

  // Macro precision, recall, F1
  let totalPrecision = 0, totalRecall = 0, classCount = 0;
  classes.forEach(cls => {
    const tp = cm[cls]?.[cls] || 0;
    const fp = classes.reduce((s, a) => s + (a !== cls ? (cm[a]?.[cls] || 0) : 0), 0);
    const fn = classes.reduce((s, p) => s + (p !== cls ? (cm[cls]?.[p] || 0) : 0), 0);
    const prec = tp + fp > 0 ? tp / (tp + fp) : 0;
    const rec  = tp + fn > 0 ? tp / (tp + fn) : 0;
    totalPrecision += prec;
    totalRecall    += rec;
    classCount++;
  });

  const precision = classCount > 0 ? totalPrecision / classCount : null;
  const recall    = classCount > 0 ? totalRecall    / classCount : null;
  const f1_score  = precision && recall && precision + recall > 0
    ? 2 * precision * recall / (precision + recall) : null;

  return {
    accuracy,
    precision,
    recall,
    f1_score,
    mae:               null,
    rmse:              null,
    confusion_matrix:  cm,
    class_distribution: dist,
    sample_count:      withPredictions.length,
  };
}

function computeRegressionMetrics(labels) {
  const withErrors = labels.filter(l => l.absolute_error !== null);
  if (!withErrors.length) return { mae: null, rmse: null };

  const errors  = withErrors.map(l => l.absolute_error);
  const mae     = errors.reduce((a, b) => a + b, 0) / errors.length;
  const rmse    = Math.sqrt(errors.map(e => e * e).reduce((a, b) => a + b, 0) / errors.length);
  const correct = withErrors.filter(l => l.correct).length;

  return {
    accuracy:          correct / withErrors.length,
    precision:         null,
    recall:            null,
    f1_score:          null,
    mae,
    rmse,
    confusion_matrix:  null,
    class_distribution: null,
    sample_count:      withErrors.length,
  };
}

function determineHealth(metrics, prevMetrics) {
  const acc = metrics.accuracy;
  if (acc === null) return 'healthy';

  // Critical: accuracy dropped below 60% or dropped >20% vs previous
  if (acc < 0.60) return 'critical';
  if (prevMetrics?.accuracy && (prevMetrics.accuracy - acc) > 0.20) return 'critical';

  // Warning: accuracy below 75% or dropped >10%
  if (acc < 0.75) return 'warning';
  if (prevMetrics?.accuracy && (prevMetrics.accuracy - acc) > 0.10) return 'warning';

  return 'healthy';
}

function getAccuracyTrend(current, previous) {
  if (!current || !previous) return 'stable';
  const delta = current - previous;
  if (delta > 0.03)  return 'improving';
  if (delta < -0.03) return 'degrading';
  return 'stable';
}

async function generateDiagnosis(modelId, metrics, prevMetrics, health, count) {
  try {
    const message = await anthropic.messages.create({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 350,
      messages:   [{
        role: 'user',
        content: `You are an ML model accuracy expert. Write a 2-3 sentence plain English diagnosis for this model's accuracy report. Use **bold** for key findings. Be specific and actionable.

Health: ${health} | Labeled samples: ${count}
Accuracy:  ${metrics.accuracy  !== null ? (metrics.accuracy  * 100).toFixed(1) + '%' : 'N/A'}
Precision: ${metrics.precision !== null ? (metrics.precision * 100).toFixed(1) + '%' : 'N/A'}
Recall:    ${metrics.recall    !== null ? (metrics.recall    * 100).toFixed(1) + '%' : 'N/A'}
F1 Score:  ${metrics.f1_score  !== null ? metrics.f1_score.toFixed(3) : 'N/A'}
MAE:       ${metrics.mae       !== null ? metrics.mae.toFixed(4) : 'N/A'}
Previous accuracy: ${prevMetrics?.accuracy !== null && prevMetrics?.accuracy !== undefined ? (prevMetrics.accuracy * 100).toFixed(1) + '%' : 'N/A'}
Trend: ${getAccuracyTrend(metrics.accuracy, prevMetrics?.accuracy)}
Class distribution: ${metrics.class_distribution ? JSON.stringify(metrics.class_distribution) : 'N/A'}

If health is critical or warning, identify the specific problem (accuracy drop, class imbalance, high false negatives etc.) and recommend a concrete action (retrain, collect more data for underperforming class, check labeling quality etc.).`
      }],
    });
    return message.content[0].text;
  } catch (err) {
    return `Model accuracy is ${metrics.accuracy !== null ? (metrics.accuracy * 100).toFixed(1) + '%' : 'unknown'} based on ${count} labeled samples. Health status: ${health}.`;
  }
}
