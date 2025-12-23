const express = require('express');
const router = express.Router();
const { restartFail2ban } = require('../services/fail2banControl');
const { API_VERSION } = require('../config/api');
const cache = require('../services/cache');
const config = require('../config/config');

/**
 * POST /api/fail2ban/restart
 * Restart the fail2ban service
 * Requires confirmation (handled by frontend)
 * Clears cache after restart to force fresh data fetch
 */
router.post('/restart', async (req, res, next) => {
  try {
    // Execute restart
    const result = await restartFail2ban();

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

