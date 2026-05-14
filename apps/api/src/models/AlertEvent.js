'use strict';

const mongoose = require('mongoose');

// Fired when a drift snapshot crosses an alert rule threshold.
// Stores the full alert context so users can review alert history
// and acknowledge/resolve incidents from the dashboard.

const alertEventSchema = new mongoose.Schema(
  {
    model_id: {
      type: String, // UUID from PostgreSQL
      required: true,
      index: true,
    },
    // UUID from PostgreSQL alert_rules.id
    rule_id: {
      type: String,
      required: true,
    },
    // ObjectId ref to drift_snapshots that triggered this alert
    snapshot_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DriftSnapshot',
      required: true,
    },
    severity: {
      type: String,
      enum: ['warning', 'critical'],
      required: true,
    },
    // AI-generated alert message sent to user
    message: {
      type: String,
      required: true,
    },
    // Which channels were actually notified
    channels_notified: {
      type: [String],
      enum: ['email', 'slack'],
      default: [],
    },
    acknowledged: {
      type: Boolean,
      default: false,
    },
    acknowledged_at: {
      type: Date,
      default: null,
    },
    fired_at: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  {
    collection: 'alert_events',
    timestamps: false,
  }
);

alertEventSchema.index({ model_id: 1, fired_at: -1 });
alertEventSchema.index({ acknowledged: 1 }); // for unread alerts count

module.exports = mongoose.model('AlertEvent', alertEventSchema);
