const express = require('express');
const router = express.Router();
const f2b = require('../services/f2b');

/**
 * GET /api/bans
 * Get all active bans
 */
router.get('/', async (req, res, next) => {
  try {
    const activeBans = await f2b.getActiveBans();
    res.json({
      success: true,
      bans: activeBans,
      count: activeBans.length,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/bans/history
 * Get ban history
 */
router.get('/history', async (req, res, next) => {
  try {
    const jail = req.query.jail || null;
    const limit = parseInt(req.query.limit) || 100;
    const history = await f2b.readBanHistory(jail, limit);
    res.json({
      success: true,
      history,
      count: history.length,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/bans/unban
 * Unban an IP from a jail
 */
router.post('/unban', async (req, res, next) => {
  try {
    const { jail, ip } = req.body;
    if (!jail || !ip) {
      return res.status(400).json({
        success: false,
        error: 'Jail name and IP address are required',
      });
    }
    const result = await f2b.unbanIP(jail, ip);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
