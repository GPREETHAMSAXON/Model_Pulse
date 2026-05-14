'use strict';

const mongoose = require('mongoose');

/**
 * GroundTruth — stores actual labels uploaded by users after predictions are made.
 * Links back to a Prediction document via prediction_id.
 *
 * This enables real accuracy computation:
 *   prediction.prediction  vs  ground_truth.actual_label
 *   → accuracy, precision, recall, F1, confusion matrix
 */
const groundTruthSchema = new mongoose.Schema({
  model_id:      { type: String, required: true, index: true },
  user_id:       { type: String, required: true },

  // Reference to the original prediction (optional — can also match by external_id)
  prediction_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Prediction', default: null, index: true },

  // External ID from user's system (e.g. order_id, user_id, transaction_id)
  // Allows matching without prediction_id
  external_id:   { type: String, default: null, index: true },

  // What the model predicted
  predicted:     { type: mongoose.Schema.Types.Mixed, default: null },
  confidence:    { type: Number, default: null },

  // What actually happened (the ground truth)
  actual:        { type: mongoose.Schema.Types.Mixed, required: true },

  // Was the prediction correct?
  correct:       { type: Boolean, default: null },

  // For regression: absolute error |predicted - actual|
  absolute_error: { type: Number, default: null },

  // Task type: classification | regression
  task_type:     { type: String, enum: ['classification', 'regression'], default: 'classification' },

  timestamp:     { type: Date, default: Date.now, index: true },
}, {
  collection: 'ground_truths',
  timestamps: false,
});

groundTruthSchema.index({ model_id: 1, timestamp: -1 });
groundTruthSchema.index({ model_id: 1, correct: 1 });

module.exports = mongoose.model('GroundTruth', groundTruthSchema);
