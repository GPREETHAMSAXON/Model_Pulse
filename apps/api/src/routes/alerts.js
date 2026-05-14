'use strict';
const express = require('express');
const router = express.Router();
// TODO: alert rules CRUD + alert event history
router.get('/ping', (req, res) => res.json({ route: 'alerts' }));
module.exports = router;
