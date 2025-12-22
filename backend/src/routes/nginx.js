const express = require('express');
const router = express.Router();
const { executeScript } = require('../services/scriptExecutor');
const { parseMonitorOutput } = require('../services/parsers/monitorParser');
const { parseNginxStats } = require('../services/parsers/nginxParser');
const cache = require('../services/cache');
const config = require('../config/config');

/**
 * GET /api/nginx
 * Returns aggregated nginx security statistics
 * Uses monitor-security.sh output
 */
router.get('/', async (req, res, next) => {
  try {
    const cacheKey = 'nginx';
    const cached = cache.get(cacheKey);
    
    if (cached) {
      return res.json(cached);
    }
    
    let stats = {
      404_count: 0,
      admin_scans: 0,
      webdav_attacks: 0,
      hidden_files_attempts: 0,
    };
    
    try {
      // Use monitor-security.sh which includes nginx stats
      const { stdout } = await executeScript('monitor-security.sh');
      const monitorData = parseMonitorOutput(stdout);
      
      stats = {
        404_count: monitorData.nginx.errors404,
        admin_scans: monitorData.nginx.adminScans,
        webdav_attacks: monitorData.nginx.webdavAttacks,
        hidden_files_attempts: monitorData.nginx.hiddenFilesAttacks,
      };
    } catch (err) {
      console.error('Failed to get nginx stats:', err.message);
      // Return zeros instead of error - graceful degradation
    }
    
    cache.set(cacheKey, stats, config.cache.nginxTTL);
    res.json(stats);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
