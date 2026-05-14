'use strict';

const express = require('express');
const { body, validationResult } = require('express-validator');
const router = express.Router();

const authSdk = require('../middleware/authSdk');
const predictionsController = require('../controllers/predictionsController');

// ── Validation rules for a single prediction object
const predictionRules = [
  body('input_features').isObject().withMessage('input_features must be an object'),
  body('prediction').exists().withMessage('prediction is required'),
  body('confidence').optional().isFloat({ min: 0, max: 1 }),
  body('latency_ms').optional().isInt({ min: 0 }),
];

// POST /api/v1/predictions/batch
// Called by the SDK client.py — authenticated via API key in Bearer header
router.post(
  '/batch',
  authSdk,
  [
    body('predictions').isArray({ min: 1, max: 500 }).withMessage('predictions must be an array of 1–500 items'),
    body('predictions.*').isObject(),
  ],
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ errors: errors.array() });
    }
    next();
  },
  predictionsController.ingestBatch
);

// GET /api/v1/predictions/:modelId
// Dashboard — fetch paginated prediction history for a model
router.get('/:modelId', authSdk, predictionsController.getByModel);

module.exports = router;
