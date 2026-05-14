'use strict';

const mongoose = require('mongoose');

// Stores every individual prediction logged via the SDK.
// High-volume collection — TTL index expires docs automatically by plan tier.
// TTL is set per-document via the `expires_at` field so different users
// can have different retention windows without multiple indexes.

const predictionSchema = new mongoose.Schema(
  {
    model_id: {
      type: String, // UUID from PostgreSQL models.id
      required: true,
      index: true,
    },
    user_id: {
      type: String, // UUID from PostgreSQL users.id
      required: true,
      index: true,
    },
    // { age: 34, income: 72000, gender: "male", ... }
    input_features: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    // scalar for regression, string label for classification
    prediction: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    // probability / softmax confidence score — null if model doesn't provide it
    confidence: {
      type: Number,
      min: 0,
      max: 1,
      default: null,
    },
    // SDK-measured round-trip latency in milliseconds
    latency_ms: {
      type: Number,
      default: null,
    },
    sdk_version: {
      type: String,
      default: '0.1.0',
    },
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },
    // TTL field — set by API based on user's plan at ingest time
    // hobby: 7d, pro: 90d, team: 365d
    expires_at: {
      type: Date,
      index: { expireAfterSeconds: 0 }, // MongoDB uses the field value itself as TTL
    },
  },
  {
    collection: 'predictions',
    timestamps: false, // using custom `timestamp` field
  }
);

// Compound index for the most common query: "get predictions for model X in time range"
predictionSchema.index({ model_id: 1, timestamp: -1 });

module.exports = mongoose.model('Prediction', predictionSchema);
