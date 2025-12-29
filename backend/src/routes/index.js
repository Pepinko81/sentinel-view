const express = require('express');
const router = express.Router();

const jailsRouter = require('./jails');
const systemRouter = require('./system');
const filtersRouter = require('./filters');
const bansRouter = require('./bans');
const jailConfigRouter = require('./jailConfig');
// Note: agentRouter is mounted separately in index.js (before requireAuth)
const serversRouter = require('./servers');

// Mount routes
router.use('/jails', jailsRouter);
router.use('/system', systemRouter);
router.use('/filters', filtersRouter);
router.use('/bans', bansRouter);
router.use('/jail-config', jailConfigRouter);
// Note: /agent is mounted in index.js before requireAuth middleware
router.use('/servers', serversRouter);

module.exports = router;

