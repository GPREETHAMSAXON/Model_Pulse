'use strict';

const Prediction = require('../models/Prediction');
const Baseline   = require('../models/Baseline');

// Retention window in days by plan
const RETENTION_DAYS = { hobby: 7, pro: 90, team: 365 };

// POST /api/v1/predictions/batch
exports.ingestBatch = async (req, res, next) => {
  try {
    const { predictions } = req.body;
    const model   = req.model;
    const user_id = req.user_id;
    const plan    = req.apiKey?.User?.plan || 'hobby';

    const retentionDays = RETENTION_DAYS[plan] ?? 7;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + retentionDays * 24 * 60 * 60 * 1000);

    // Build MongoDB docs
    const docs = predictions.map((p) => ({
      model_id:       model.id,
      user_id,
      input_features: p.input_features,
      prediction:     p.prediction,
      confidence:     p.confidence ?? null,
      latency_ms:     p.latency_ms ?? null,
      sdk_version:    p.sdk_version || '0.1.0',
      timestamp:      now,
      expires_at:     expiresAt,
    }));

    await Prediction.insertMany(docs, { ordered: false });

    // Update baseline sample count asynchronously
    Baseline.findOneAndUpdate(
      { model_id: model.id },
      { $inc: { sample_size: docs.length } },
      { upsert: true, new: true }
    ).then((baseline) => {
      // Mark baseline as ready once we have >= 100 predictions
      if (!baseline.is_ready && baseline.sample_size >= 100) {
        baseline.is_ready = true;
        baseline.save().catch(() => {});
      }
    }).catch(() => {});

    res.status(202).json({
      accepted: docs.length,
      message:  `${docs.length} prediction(s) queued for processing`,
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/v1/predictions/:modelId
exports.getByModel = async (req, res, next) => {
  try {
    const { modelId } = req.params;

    // Ensure the requesting key owns this model
    if (req.model.id !== modelId) {
      return res.status(403).json({ error: 'Access denied to this model' });
    }

    const page  = Math.max(1, parseInt(req.query.page)  || 1);
    const limit = Math.min(200, parseInt(req.query.limit) || 50);
    const skip  = (page - 1) * limit;

    // Optional time range filter
    const filter = { model_id: modelId };
    if (req.query.from) filter.timestamp = { $gte: new Date(req.query.from) };
    if (req.query.to)   filter.timestamp = { ...filter.timestamp, $lte: new Date(req.query.to) };

    const [predictions, total] = await Promise.all([
      Prediction.find(filter)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit)
        .select('-__v'),
      Prediction.countDocuments(filter),
    ]);

    res.json({
      data:       predictions,
      pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
};
