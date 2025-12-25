const express = require('express');
const router = express.Router();
const f2b = require('../services/f2b');
const { API_VERSION } = require('../config/api');
const cache = require('../services/cache');

/**
 * POST /api/fail2ban/restart
 * Restart the fail2ban service
 * Requires confirmation (handled by frontend)
 * Clears cache after restart to force fresh data fetch
 */
router.post('/restart', async (req, res, next) => {
  try {
    // Execute restart using f2b service
    const result = await f2b.restartFail2ban();

    // Clear cache to force fresh data fetch after restart
    cache.clear();

    res.setHeader('X-API-Version', API_VERSION);
    res.json({
      success: true,
      message: result.message,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    // Log error for debugging
    console.error('[FAIL2BAN RESTART] Error:', err.message);

    res.setHeader('X-API-Version', API_VERSION);
    res.status(500).json({
      success: false,
      error: err.message || 'Failed to restart fail2ban service',
      timestamp: new Date().toISOString(),
    });
  }
});

module.exports = router;

