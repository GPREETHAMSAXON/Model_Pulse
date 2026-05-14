'use strict';

const express = require('express');
const { body, validationResult } = require('express-validator');
const router  = express.Router();
const authSdk = require('../middleware/authSdk');
const auth    = require('../middleware/authJwt');
const llmCtrl = require('../controllers/llmController');

// ── POST /api/v1/llm/batch  (SDK → ingest LLM calls)
router.post('/batch',
  authSdk,
  [
    body('calls').isArray({ min: 1, max: 200 }).withMessage('calls must be array of 1-200 items'),
    body('calls.*.provider').optional().isString(),
    body('calls.*.llm_model').optional().isString(),
    body('calls.*.latency_ms').optional().isInt({ min: 0 }),
    body('calls.*.prompt_tokens').optional().isInt({ min: 0 }),
    body('calls.*.completion_tokens').optional().isInt({ min: 0 }),
    body('calls.*.cost_usd').optional().isFloat({ min: 0 }),
    body('calls.*.quality_score').optional().isFloat({ min: 0, max: 1 }),
  ],
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });
    next();
  },
  llmCtrl.ingestBatch
);

// ── GET /api/v1/llm/:modelId/snapshots  (dashboard)
router.get('/:modelId/snapshots', auth, llmCtrl.getSnapshots);

// ── GET /api/v1/llm/:modelId/calls  (dashboard)
router.get('/:modelId/calls', auth, llmCtrl.getCalls);

// ── GET /api/v1/llm/:modelId/stats  (dashboard)
router.get('/:modelId/stats', auth, llmCtrl.getStats);

// ── POST /api/v1/llm/:modelId/feedback
router.post('/:modelId/feedback', auth,
  [
    body('call_id').notEmpty(),
    body('thumbs_up').optional().isBoolean(),
    body('quality_score').optional().isFloat({ min: 0, max: 1 }),
    body('hallucination').optional().isBoolean(),
  ],
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });
    next();
  },
  llmCtrl.submitFeedback
);

module.exports = router;
