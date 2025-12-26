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
    console.log(`[BANS API] GET /api/bans/history - jail: ${jail || 'all'}, limit: ${limit}`);
    const history = await f2b.readBanHistory(jail, limit);
    console.log(`[BANS API] Returning ${history.length} ban history records`);
    
    // Convert to frontend format: history -> events, timeofban -> timestamp
    const events = history.map(record => ({
      jail: record.jail,
      ip: record.ip,
      action: record.action || 'ban',
      timestamp: record.timeofban 
        ? new Date(record.timeofban * 1000).toISOString() 
        : new Date().toISOString(),
    }));
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`[BANS API] Converted ${history.length} records to ${events.length} events`);
      if (events.length > 0) {
        console.log(`[BANS API] First event:`, JSON.stringify(events[0], null, 2));
      }
    }
    
    res.json({
      success: true,
      events: events,
      total: events.length,
      jail: jail,
      limit: limit,
    });
  } catch (err) {
    console.error(`[BANS API] Error reading ban history: ${err.message}`);
    next(err);
  }
});

/**
 * POST /api/bans/unban
 * Unban an IP from a jail
 * 
 * Request body:
 *   { "jail": "nginx-hidden-files", "ip": "123.45.67.89" }
 * 
 * Validation:
 *   - jail must be a string and must exist in fail2ban
 *   - ip must be valid IPv4 or IPv6
 *   - reject "*" or missing fields
 *   - if jail is disabled or missing → return error JSON
 */
router.post('/unban', async (req, res, next) => {
  try {
    const { jail, ip } = req.body;
    
    // Validate required fields
    if (!jail || typeof jail !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Jail name is required and must be a string',
      });
    }
    
    if (!ip || typeof ip !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'IP address is required and must be a string',
      });
    }
    
    // Reject wildcard or empty values
    if (jail === '*' || jail.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Invalid jail name: wildcard "*" or empty string not allowed',
      });
    }
    
    if (ip === '*' || ip.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Invalid IP address: wildcard "*" or empty string not allowed',
      });
    }
    
    console.log(`[BANS API] POST /api/bans/unban - jail: ${jail}, ip: ${ip}`);
    
    // Execute unban
    const result = await f2b.unbanIP(jail, ip);
    
    console.log(`[BANS API] Unban successful: ${result.message}`);
    
    // Return success response with jail and ip
    res.json({
      success: true,
      jail: jail,
      ip: ip,
      message: result.message,
    });
  } catch (err) {
    console.error(`[BANS API] Unban failed: ${err.message}`);
    
    // Return error response
    res.status(400).json({
      success: false,
      error: err.message || 'Failed to unban IP',
      jail: req.body.jail || null,
      ip: req.body.ip || null,
    });
  }
});

module.exports = router;
