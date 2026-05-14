'use strict';

const express    = require('express');
const { body, validationResult } = require('express-validator');
const router     = express.Router();
const authController = require('../controllers/authController');
const authJwt    = require('../middleware/authJwt');

// ── Validation helpers
const registerRules = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
];

const loginRules = [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
];

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });
  next();
};

// POST /api/v1/auth/register
router.post('/register', registerRules, validate, authController.register);

// POST /api/v1/auth/login
router.post('/login', loginRules, validate, authController.login);

// POST /api/v1/auth/google
// Receives Google ID token from frontend, verifies and signs in/up
router.post('/google', body('id_token').notEmpty(), validate, authController.googleAuth);

// GET /api/v1/auth/me  (protected)
router.get('/me', authJwt, authController.me);

// POST /api/v1/auth/logout
router.post('/logout', authJwt, authController.logout);

module.exports = router;
