'use strict';

const { ApiKey, Model } = require('../models');
const bcrypt = require('bcryptjs');

// Authenticates SDK requests via Bearer API key.
// Attaches req.apiKey, req.model, req.user_id for downstream controllers.

module.exports = async function authSdk(req, res, next) {
  try {
    const authHeader = req.headers['authorization'] || '';
    const raw = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!raw || !raw.startsWith('mp_')) {
      return res.status(401).json({ error: 'Missing or malformed API key' });
    }

    // Extract the prefix (first 16 chars) to narrow DB lookup before bcrypt
    const prefix = raw.slice(0, 16);

    // Find all non-revoked keys with this prefix (should be 1 in practice)
    const candidates = await ApiKey.findAll({
      where: { key_prefix: prefix, revoked: false },
      include: [{ model: Model, as: 'Model' }],
    });

    if (!candidates.length) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    // bcrypt compare against each candidate (almost always just 1)
    let matched = null;
    for (const candidate of candidates) {
      const ok = await bcrypt.compare(raw, candidate.key_hash);
      if (ok) { matched = candidate; break; }
    }

    if (!matched) {
      return res.status(401).json({ error: 'Invalid API key' });
    }

    if (!matched.Model || matched.Model.status === 'archived') {
      return res.status(403).json({ error: 'Model is archived or not found' });
    }

    // Update last_used_at asynchronously — don't block the request
    matched.update({ last_used_at: new Date() }).catch(() => {});

    req.apiKey  = matched;
    req.model   = matched.Model;
    req.user_id = matched.user_id;

    next();
  } catch (err) {
    next(err);
  }
};
