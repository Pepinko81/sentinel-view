const express = require('express');
const router = express.Router();
const { getBanHistory } = require('../services/banHistoryParser');
const { API_VERSION } = require('../config/api');

/**
 * GET /api/history
 * Returns ban history from fail2ban.log
 * Query params:
 *   - jail (optional): Filter by jail name
 *   - limit (optional, default 50): Max entries to return
 */
router.get('/', async (req, res, next) => {
  try {
    const jailFilter = req.query.jail || null;
    const limit = parseInt(req.query.limit, 10) || 50;

    // Validate limit
    if (limit < 1 || limit > 1000) {
      return res.status(400).json({
        success: false,
        error: 'Limit must be between 1 and 1000',
      });
    }

    // Get ban history
    const events = await getBanHistory(jailFilter, limit);

    res.setHeader('X-API-Version', API_VERSION);
    res.json({
      success: true,
      events: events,
      total: events.length,
      jail: jailFilter,
      limit: limit,
    });
  } catch (err) {
    console.error('[HISTORY API] Error:', err);
    
    // Return error response (per user requirement)
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to read ban history',
      details: {
        message: err.message,
        code: err.code,
      },
    });
  }
});

module.exports = router;

