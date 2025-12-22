const express = require('express');
const router = express.Router();

const overviewRouter = require('./overview');
const jailsRouter = require('./jails');
const nginxRouter = require('./nginx');
const systemRouter = require('./system');
const backupRouter = require('./backup');

// Mount routes
router.use('/overview', overviewRouter);
router.use('/jails', jailsRouter);
router.use('/nginx', nginxRouter);
router.use('/system', systemRouter);
router.use('/backup', backupRouter);

module.exports = router;

