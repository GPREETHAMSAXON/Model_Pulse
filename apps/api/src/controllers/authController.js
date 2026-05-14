'use strict';

const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const axios  = require('axios');
const { User } = require('../models');

const SALT_ROUNDS = 12;

// ── Helper: sign a JWT for a user
function signToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, plan: user.plan },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

// ── Helper: safe user object (no password hash)
function safeUser(user) {
  const { password_hash, ...rest } = user.toJSON();
  return rest;
}

// POST /api/v1/auth/register
exports.register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    const exists = await User.findOne({ where: { email } });
    if (exists) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await User.create({ name, email, password_hash, plan: 'hobby' });

    const token = signToken(user);
    res.status(201).json({ token, user: safeUser(user) });
  } catch (err) {
    next(err);
  }
};

// POST /api/v1/auth/login
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ where: { email } });
    if (!user || !user.password_hash) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = signToken(user);
    res.json({ token, user: safeUser(user) });
  } catch (err) {
    next(err);
  }
};

// POST /api/v1/auth/google
// Frontend sends the Google ID token — we verify it with Google's tokeninfo endpoint
exports.googleAuth = async (req, res, next) => {
  try {
    const { id_token } = req.body;

    // Verify token with Google
    const { data } = await axios.get(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${id_token}`
    );

    if (data.aud !== process.env.GOOGLE_CLIENT_ID) {
      return res.status(401).json({ error: 'Invalid Google token audience' });
    }

    const { sub: google_id, email, name, email_verified } = data;

    if (!email_verified) {
      return res.status(401).json({ error: 'Google email not verified' });
    }

    // Find or create user
    let user = await User.findOne({ where: { google_id } });

    if (!user) {
      // Check if email exists under a different login method
      user = await User.findOne({ where: { email } });
      if (user) {
        // Link Google ID to existing account
        await user.update({ google_id });
      } else {
        // Brand new user via Google
        user = await User.create({
          name,
          email,
          google_id,
          password_hash: null,
          plan: 'hobby',
        });
      }
    }

    const token = signToken(user);
    res.json({ token, user: safeUser(user) });
  } catch (err) {
    // Google tokeninfo returned an error
    if (err.response?.status === 400) {
      return res.status(401).json({ error: 'Invalid or expired Google token' });
    }
    next(err);
  }
};

// GET /api/v1/auth/me
exports.me = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user: safeUser(user) });
  } catch (err) {
    next(err);
  }
};

// POST /api/v1/auth/logout
// JWT is stateless — logout is handled client-side by deleting the token.
// This endpoint exists for audit logging and future refresh token revocation.
exports.logout = async (req, res) => {
  res.json({ message: 'Logged out successfully' });
};
