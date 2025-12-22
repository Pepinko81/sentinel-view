const express = require('express');
const router = express.Router();
const { executeScript } = require('../services/scriptExecutor');
const { parseMonitorOutput, defaultMonitorOutput } = require('../services/parsers/monitorParser');
const { parseNginxStats, defaultNginxStats } = require('../services/parsers/nginxParser');
const { safeParse, detectFail2banError } = require('../services/parsers/parserUtils');
const cache = require('../services/cache');
const config = require('../config/config');

/**
 * GET /api/nginx
 * Returns aggregated nginx security statistics
 * Uses monitor-security.sh output
 * Handles partial data gracefully (works even if fail2ban is down)
 */
router.get('/', async (req, res, next) => {
  try {
    const cacheKey = 'nginx';
    const cached = cache.get(cacheKey);
    
    if (cached) {
      return res.json(cached);
    }
    
    // Safe defaults
    const safeDefaults = {
      ...defaultNginxStats,
    };
    
    let stats = { ...safeDefaults };
    
    try {
      // Use monitor-security.sh which includes nginx stats
      const { stdout, stderr } = await executeScript('monitor-security.sh');
      
      // Check for errors (but nginx data might still be available even if fail2ban is down)
      const errorCheck = detectFail2banError(stdout, stderr);
      
      // Parse monitor output
      const monitorData = safeParse(parseMonitorOutput, stdout, defaultMonitorOutput);
      
      // Extract nginx stats from monitor data
      if (monitorData.nginx) {
        stats = {
          404_count: monitorData.nginx.errors404 || 0,
          admin_scans: monitorData.nginx.adminScans || 0,
          webdav_attacks: monitorData.nginx.webdavAttacks || 0,
          hidden_files_attempts: monitorData.nginx.hiddenFilesAttacks || 0,
          robots_scans: monitorData.nginx.robotsScans || 0,
          total_requests: monitorData.nginx.totalRequests || 0,
          errors: monitorData.errors || [],
          partial: monitorData.partial || false,
        };
      } else {
        // Fallback: try parsing as standalone nginx stats
        const nginxData = safeParse(parseNginxStats, stdout, defaultNginxStats);
        stats = nginxData;
      }
      
      // Add fail2ban error to errors array if present (but don't fail the request)
      if (errorCheck.isError && errorCheck.errorType !== 'empty_output') {
        stats.errors = stats.errors || [];
        if (!stats.errors.some(e => e.includes('fail2ban'))) {
          stats.errors.push(`fail2ban unavailable (nginx data still available): ${errorCheck.message}`);
        }
        stats.partial = true;
      }
    } catch (err) {
      console.error('Failed to get nginx stats:', err.message);
      // Return zeros instead of error - graceful degradation
      stats = {
        ...safeDefaults,
        errors: [`Failed to retrieve nginx statistics: ${err.message}`],
        partial: true,
      };
    }
    
    cache.set(cacheKey, stats, config.cache.nginxTTL);
    res.json(stats);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
