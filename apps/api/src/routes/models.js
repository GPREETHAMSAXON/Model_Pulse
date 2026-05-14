'use strict';

const express = require('express');
const { body, validationResult } = require('express-validator');
const router = express.Router();
const authJwt = require('../middleware/authJwt');
const modelsController = require('../controllers/modelsController');

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });
  next();
};

const createRules = [
  body('name').trim().notEmpty().withMessage('Model name is required'),
  body('task_type')
    .isIn(['classification', 'regression', 'other'])
    .withMessage('task_type must be classification, regression, or other'),
  body('description').optional().trim(),
  body('feature_schema').optional().isObject().withMessage('feature_schema must be an object'),
];

const updateRules = [
  body('name').optional().trim().notEmpty(),
  body('description').optional().trim(),
  body('status').optional().isIn(['active', 'paused', 'archived']),
  body('feature_schema').optional().isObject(),
];

// All routes require JWT
router.use(authJwt);

// GET    /api/v1/models          — list all models for current user
// POST   /api/v1/models          — create a new model
// GET    /api/v1/models/:id      — get single model
// PATCH  /api/v1/models/:id      — update model
// DELETE /api/v1/models/:id      — archive model (soft delete)
// POST   /api/v1/models/:id/keys — generate a new API key for this model

router.get('/',       modelsController.list);
router.post('/',      createRules, validate, modelsController.create);
router.get('/:id',    modelsController.get);
router.patch('/:id',  updateRules, validate, modelsController.update);
router.delete('/:id', modelsController.archive);
router.post('/:id/keys', modelsController.generateApiKey);
router.get('/:id/keys',  modelsController.listApiKeys);
router.delete('/:id/keys/:keyId', modelsController.revokeApiKey);

module.exports = router;
