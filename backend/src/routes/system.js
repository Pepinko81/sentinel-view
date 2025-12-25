const express = require('express');
const router = express.Router();
const f2b = require('../services/f2b');

/**
 * POST /api/system/restart
 * Restart fail2ban service
 */
router.post('/restart', async (req, res, next) => {
  try {
    const result = await f2b.restartFail2ban();
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
