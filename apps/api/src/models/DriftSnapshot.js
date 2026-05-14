'use strict';

const mongoose = require('mongoose');

const driftSnapshotSchema = new mongoose.Schema(
  {
    model_id: {
      type: String,
      required: true,
      index: true,
    },
    computed_at: {
      type: Date,
      default: Date.now,
      index: true,
    },
    window_start: { type: Date, required: true },
    window_end:   { type: Date, required: true },

    prediction_count: {
      type: Number,
      default: 0,
    },

    // { age: { psi: 0.12, ks_stat: 0.08, ks_pvalue: 0.03, drifted: true }, ... }
    // Using Mixed so any feature name is accepted without schema restrictions
    feature_drift: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // { psi: 0.31, drifted: true }
    prediction_drift: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    overall_health: {
      type: String,
      enum: ['healthy', 'warning', 'critical'],
      default: 'healthy',
    },

    ai_diagnosis: {
      type: String,
      default: null,
    },

    alert_fired: {
      type: Boolean,
      default: false,
    },
  },
  {
    collection: 'drift_snapshots',
    timestamps: false,
  }
);

driftSnapshotSchema.index({ model_id: 1, computed_at: -1 });

module.exports = mongoose.model('DriftSnapshot', driftSnapshotSchema);
