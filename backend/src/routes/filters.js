const express = require('express');
const router = express.Router();
const f2b = require('../services/f2b');

/**
 * POST /api/filters/create
 * Create a new filter file
 */
router.post('/create', async (req, res, next) => {
  try {
    const { name, failregex, ignoreregex } = req.body;
    
    if (!name || !failregex) {
      return res.status(400).json({
        success: false,
        error: 'Filter name and failregex are required',
      });
    }
    
    const result = await f2b.createFilter(name, failregex, ignoreregex || null);
    
    // Automatically restart fail2ban after creating filter
    try {
      await f2b.restartFail2ban();
      result.message += ' Fail2ban restarted.';
    } catch (restartErr) {
      result.warning = `Filter created but restart failed: ${restartErr.message}`;
    }
    
    res.json(result);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
