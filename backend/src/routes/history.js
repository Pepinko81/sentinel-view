const express = require('express');
const router = express.Router();
const { getBanHistoryFromLog } = require('../services/fail2banAdapter');
const { API_VERSION } = require('../config/api');
const cache = require('../services/cache');
const config = require('../config/config');

/**
 * GET /api/history
 * Returns ban history from fail2ban.log
 * Query params:
 *   - jail (optional): Filter by jail name
 *   - limit (optional, default 50): Max entries to return
 */
/**
 * GET /api/history
 * Returns ban history from log file (backward compatibility endpoint)
 * New endpoint: /api/bans/history
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

    const cacheKey = `history:${jailFilter || 'all'}:${limit}`;
    const cached = cache.get(cacheKey);
    
    if (cached) {
      res.setHeader('X-API-Version', API_VERSION);
      return res.json(cached);
    }

    console.log(`[HISTORY API] Request: jail=${jailFilter}, limit=${limit}`);

    // Get ban history using adapter
    const events = await getBanHistoryFromLog(jailFilter, limit);

    console.log(`[HISTORY API] Found ${events.length} events`);

    const response = {
      success: true,
      events: events,
      total: events.length,
      jail: jailFilter,
      limit: limit,
    };

    cache.set(cacheKey, response, config.cache.jailsTTL);
    res.setHeader('X-API-Version', API_VERSION);
    res.json(response);
  } catch (err) {
    console.error('[HISTORY API] Error:', err);
    console.error('[HISTORY API] Error stack:', err.stack);
    
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

