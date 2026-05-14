'use strict';

const express = require('express');
const { body, validationResult } = require('express-validator');
const router  = express.Router();
const authSdk = require('../middleware/authSdk');
const auth    = require('../middleware/authJwt');
const gtCtrl  = require('../controllers/groundTruthController');

// ── POST /api/v1/ground-truth/batch
// Upload actual labels — called by SDK or directly by user
router.post('/batch',
  authSdk,
  [
    body('labels').isArray({ min: 1, max: 500 }).withMessage('labels must be array of 1-500 items'),
    body('labels.*.actual').exists().withMessage('actual label is required for each item'),
  ],
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });
    next();
  },
  gtCtrl.uploadBatch
);

// ── GET /api/v1/ground-truth/:modelId/accuracy
// Real-time accuracy metrics
router.get('/:modelId/accuracy', auth, gtCtrl.getAccuracy);

// ── GET /api/v1/ground-truth/:modelId/snapshots
// Historical accuracy snapshots
router.get('/:modelId/snapshots', auth, gtCtrl.getSnapshots);

// ── GET /api/v1/ground-truth/:modelId/confusion
// Confusion matrix
router.get('/:modelId/confusion', auth, gtCtrl.getConfusionMatrix);

module.exports = router;
