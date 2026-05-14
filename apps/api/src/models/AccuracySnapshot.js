'use strict';

const mongoose = require('mongoose');

/**
 * AccuracySnapshot — hourly computed accuracy metrics for a model.
 * Computed from GroundTruth records.
 * Analogous to DriftSnapshot but measures output quality not input drift.
 */
const accuracySnapshotSchema = new mongoose.Schema({
  model_id:    { type: String, required: true, index: true },
  computed_at: { type: Date, default: Date.now, index: true },
  window_start: { type: Date },
  window_end:   { type: Date },

  // Sample sizes
  total_predictions:   { type: Number, default: 0 },
  labeled_predictions: { type: Number, default: 0 }, // how many have ground truth

  // Classification metrics
  accuracy:   { type: Number, default: null }, // correct / total
  precision:  { type: Number, default: null }, // TP / (TP + FP)
  recall:     { type: Number, default: null }, // TP / (TP + FN)
  f1_score:   { type: Number, default: null }, // 2 * precision * recall / (precision + recall)

  // Regression metrics (if applicable)
  mae:  { type: Number, default: null }, // mean absolute error
  rmse: { type: Number, default: null }, // root mean square error

  // Confusion matrix (for classification — stored as flat JSON)
  // { "retain_retain": 40, "retain_churn": 5, "churn_retain": 8, "churn_churn": 17 }
  confusion_matrix: { type: mongoose.Schema.Types.Mixed, default: null },

  // Class distribution in ground truth
  class_distribution: { type: mongoose.Schema.Types.Mixed, default: null },

  // Trends vs previous window
  accuracy_trend: { type: String, enum: ['stable', 'improving', 'degrading'], default: 'stable' },

  // Health based on accuracy thresholds
  overall_health: { type: String, enum: ['healthy', 'warning', 'critical'], default: 'healthy' },

  ai_diagnosis: { type: String, default: null },
}, {
  collection: 'accuracy_snapshots',
  timestamps: false,
});

accuracySnapshotSchema.index({ model_id: 1, computed_at: -1 });

module.exports = mongoose.model('AccuracySnapshot', accuracySnapshotSchema);
