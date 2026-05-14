'use strict';
const express = require('express');
const router = express.Router();
// TODO: PDF/HTML report generation
router.get('/ping', (req, res) => res.json({ route: 'reports' }));
module.exports = router;
