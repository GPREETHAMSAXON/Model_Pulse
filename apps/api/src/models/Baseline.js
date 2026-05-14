'use strict';

const mongoose = require('mongoose');

// One baseline per model — computed from the first N predictions after model creation.
// Used as the reference distribution for all future drift calculations.
// Users can manually reset the baseline from the dashboard.

const featureStatsSchema = new mongoose.Schema(
  {
    mean:   { type: Number, default: null },
    std:    { type: Number, default: null },
    min:    { type: Number, default: null },
    max:    { type: Number, default: null },
    median: { type: Number, default: null },
    // histogram bins for drift visualization in the dashboard
    // [{ bin_start: 0, bin_end: 10, count: 42 }, ...]
    histogram: { type: Array, default: [] },
    // for categorical features
    value_counts: { type: Map, of: Number, default: {} },
    dtype: {
      type: String,
      enum: ['float', 'int', 'string', 'boolean'],
      default: 'float',
    },
  },
  { _id: false }
);

const baselineSchema = new mongoose.Schema(
  {
    model_id: {
      type: String, // UUID from PostgreSQL — one baseline per model
      required: true,
      unique: true,
      index: true,
    },
    // Per-feature baseline statistics
    // { age: { mean: 35, std: 10, ... }, income: { ... } }
    feature_stats: {
      type: Map,
      of: featureStatsSchema,
      default: {},
    },
    // Statistics on the prediction output distribution
    prediction_stats: {
      mean:      { type: Number, default: null },
      std:       { type: Number, default: null },
      histogram: { type: Array, default: [] },
      // for classification: { "positive": 0.62, "negative": 0.38 }
      class_distribution: { type: Map, of: Number, default: {} },
    },
    // Number of predictions this baseline was computed from
    sample_size: {
      type: Number,
      required: true,
      default: 0,
    },
    // Minimum predictions required before baseline is considered valid
    is_ready: {
      type: Boolean,
      default: false,
    },
    created_at: {
      type: Date,
      default: Date.now,
    },
    // Tracks manual resets — useful for debugging drift history
    reset_count: {
      type: Number,
      default: 0,
    },
  },
  {
    collection: 'baselines',
    timestamps: false,
  }
);

module.exports = mongoose.model('Baseline', baselineSchema);
