const express = require('express');
const router = express.Router();

const jailsRouter = require('./jails');
const systemRouter = require('./system');
const filtersRouter = require('./filters');
const bansRouter = require('./bans');
const jailConfigRouter = require('./jailConfig');

// Mount routes
router.use('/jails', jailsRouter);
router.use('/system', systemRouter);
router.use('/filters', filtersRouter);
router.use('/bans', bansRouter);
router.use('/jail-config', jailConfigRouter);

module.exports = router;

