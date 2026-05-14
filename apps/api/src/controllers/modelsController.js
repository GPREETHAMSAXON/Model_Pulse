'use strict';

const crypto   = require('crypto');
const bcrypt   = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { Model, ApiKey, User } = require('../models');

const PLAN_MODEL_LIMITS = { hobby: 1, pro: 5, team: Infinity };

// ── GET /api/v1/models
exports.list = async (req, res, next) => {
  try {
    const models = await Model.findAll({
      where: { user_id: req.userId },
      order: [['created_at', 'DESC']],
      attributes: { exclude: [] },
    });
    res.json({ data: models, total: models.length });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/v1/models
exports.create = async (req, res, next) => {
  try {
    const { name, task_type, description, feature_schema } = req.body;

    // Enforce plan model limits
    const user = await User.findByPk(req.userId);
    const count = await Model.count({ where: { user_id: req.userId, status: ['active', 'paused'] } });
    const limit = PLAN_MODEL_LIMITS[user.plan] ?? 1;

    if (count >= limit) {
      return res.status(403).json({
        error: `Your ${user.plan} plan allows a maximum of ${limit} model(s). Upgrade to add more.`,
      });
    }

    const model = await Model.create({
      id: uuidv4(),
      user_id: req.userId,
      name,
      task_type,
      description: description || null,
      feature_schema: feature_schema || {},
      status: 'active',
    });

    res.status(201).json({ data: model });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/v1/models/:id
exports.get = async (req, res, next) => {
  try {
    const model = await Model.findOne({
      where: { id: req.params.id, user_id: req.userId },
    });
    if (!model) return res.status(404).json({ error: 'Model not found' });
    res.json({ data: model });
  } catch (err) {
    next(err);
  }
};

// ── PATCH /api/v1/models/:id
exports.update = async (req, res, next) => {
  try {
    const model = await Model.findOne({
      where: { id: req.params.id, user_id: req.userId },
    });
    if (!model) return res.status(404).json({ error: 'Model not found' });

    const { name, description, status, feature_schema } = req.body;
    await model.update({
      ...(name           !== undefined && { name }),
      ...(description    !== undefined && { description }),
      ...(status         !== undefined && { status }),
      ...(feature_schema !== undefined && { feature_schema }),
    });

    res.json({ data: model });
  } catch (err) {
    next(err);
  }
};

// ── DELETE /api/v1/models/:id  (soft delete — sets status to archived)
exports.archive = async (req, res, next) => {
  try {
    const model = await Model.findOne({
      where: { id: req.params.id, user_id: req.userId },
    });
    if (!model) return res.status(404).json({ error: 'Model not found' });

    await model.update({ status: 'archived' });
    res.json({ message: `Model "${model.name}" archived successfully` });
  } catch (err) {
    next(err);
  }
};

// ── POST /api/v1/models/:id/keys  — generate a new API key
exports.generateApiKey = async (req, res, next) => {
  try {
    const model = await Model.findOne({
      where: { id: req.params.id, user_id: req.userId },
    });
    if (!model) return res.status(404).json({ error: 'Model not found' });

    // Generate a cryptographically random key
    const rawKey = `mp_live_${crypto.randomBytes(24).toString('base64url')}`;
    const prefix = rawKey.slice(0, 16); // mp_live_xxxxxxxx
    const key_hash = await bcrypt.hash(rawKey, 10);
    const label = req.body.label || 'Default key';

    const apiKey = await ApiKey.create({
      id: uuidv4(),
      user_id: req.userId,
      model_id: model.id,
      key_hash,
      key_prefix: prefix,
      label,
    });

    // Return the raw key ONCE — it is never stored and cannot be retrieved again
    res.status(201).json({
      message: 'API key generated. Copy it now — it will not be shown again.',
      api_key: rawKey,
      key_id:  apiKey.id,
      prefix:  apiKey.key_prefix,
      label:   apiKey.label,
    });
  } catch (err) {
    next(err);
  }
};

// ── GET /api/v1/models/:id/keys  — list API keys (prefixes only, never raw)
exports.listApiKeys = async (req, res, next) => {
  try {
    const model = await Model.findOne({
      where: { id: req.params.id, user_id: req.userId },
    });
    if (!model) return res.status(404).json({ error: 'Model not found' });

    const keys = await ApiKey.findAll({
      where: { model_id: model.id, revoked: false },
      attributes: ['id', 'key_prefix', 'label', 'last_used_at', 'created_at'],
      order: [['created_at', 'DESC']],
    });

    res.json({ data: keys });
  } catch (err) {
    next(err);
  }
};

// ── DELETE /api/v1/models/:id/keys/:keyId  — revoke an API key
exports.revokeApiKey = async (req, res, next) => {
  try {
    const key = await ApiKey.findOne({
      where: { id: req.params.keyId, user_id: req.userId },
    });
    if (!key) return res.status(404).json({ error: 'API key not found' });

    await key.update({ revoked: true });
    res.json({ message: 'API key revoked successfully' });
  } catch (err) {
    next(err);
  }
};
