const express = require('express');
const router = express.Router();
const { executeScript } = require('../services/scriptExecutor');
const { parseMonitorOutput } = require('../services/parsers/monitorParser');
const { parseFail2banStatus, extractJailNames, parseJailStatus } = require('../services/parsers/fail2banParser');
const { inferCategory, inferSeverity } = require('../utils/jailClassifier');
const { isValidJailName } = require('../utils/validators');
const cache = require('../services/cache');
const config = require('../config/config');

/**
 * GET /api/jails
 * Returns dynamic list of all jails
 * Uses monitor-security.sh to get comprehensive jail data
 */
router.get('/', async (req, res, next) => {
  try {
    const cacheKey = 'jails';
    const cached = cache.get(cacheKey);
    
    if (cached) {
      return res.json(cached);
    }
    
    // Use monitor-security.sh for comprehensive data
    let monitorData = null;
    try {
      const { stdout } = await executeScript('monitor-security.sh');
      monitorData = parseMonitorOutput(stdout);
    } catch (err) {
      console.error('Failed to execute monitor-security.sh:', err.message);
      // Fallback: try quick-check.sh
      try {
        const { stdout: quickOutput } = await executeScript('quick-check.sh');
        // For quick-check, we only get jail names, need to get details separately
        const { parseQuickCheck } = require('../services/parsers/monitorParser');
        const quickData = parseQuickCheck(quickOutput);
        
        // Get details for each jail
        const jails = [];
        for (const jailName of quickData.jails) {
          try {
            // Use test-fail2ban.sh or fail2ban-client directly via a wrapper
            // For now, create minimal jail entry
            jails.push({
              name: jailName,
              enabled: false,
              bannedIPs: [],
              category: inferCategory(jailName),
              filter: jailName,
            });
          } catch (err) {
            console.warn(`Failed to get details for jail ${jailName}:`, err.message);
          }
        }
        
        const response = {
          jails,
          lastUpdated: new Date().toISOString(),
          serverStatus: 'online',
        };
        
        cache.set(cacheKey, response, config.cache.jailsTTL);
        return res.json(response);
      } catch (fallbackErr) {
        return res.json({
          jails: [],
          lastUpdated: new Date().toISOString(),
          serverStatus: 'offline',
        });
      }
    }
    
    // Transform monitor data to frontend format
    const jails = monitorData.jails.map(jail => ({
      name: jail.name,
      enabled: jail.bannedIPs.length > 0 || jail.bannedCount > 0,
      bannedIPs: jail.bannedIPs.map(ip => ({
        ip,
        bannedAt: new Date().toISOString(),
        banCount: 1,
      })),
      category: inferCategory(jail.name),
      filter: jail.name,
      maxRetry: null,
      banTime: null,
    }));
    
    // Also include jails that might not have banned IPs but are configured
    for (const jailName of monitorData.fail2ban.jails) {
      if (!jails.find(j => j.name === jailName)) {
        jails.push({
          name: jailName,
          enabled: false,
          bannedIPs: [],
          category: inferCategory(jailName),
          filter: jailName,
        });
      }
    }
    
    const response = {
      jails,
      lastUpdated: new Date().toISOString(),
      serverStatus: 'online',
    };
    
    cache.set(cacheKey, response, config.cache.jailsTTL);
    res.json(response);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/jails/:name
 * Returns details for a single jail
 * Uses test-fail2ban.sh output or fail2ban-client directly
 */
router.get('/:name', async (req, res, next) => {
  try {
    const jailName = req.params.name;
    
    // Validate jail name
    if (!isValidJailName(jailName)) {
      return res.status(400).json({
        error: 'Invalid jail name',
        code: 'INVALID_JAIL_NAME',
      });
    }
    
    const cacheKey = `jail:${jailName}`;
    const cached = cache.get(cacheKey);
    
    if (cached) {
      return res.json(cached);
    }
    
    // First check if jail exists using monitor-security.sh
    let monitorData = null;
    try {
      const { stdout } = await executeScript('monitor-security.sh');
      monitorData = parseMonitorOutput(stdout);
    } catch (err) {
      return res.status(503).json({
        error: 'Failed to connect to fail2ban',
        code: 'FAIL2BAN_UNAVAILABLE',
      });
    }
    
    if (!monitorData.fail2ban.jails.includes(jailName)) {
      return res.status(404).json({
        error: `Jail "${jailName}" not found`,
        code: 'JAIL_NOT_FOUND',
      });
    }
    
    // Find jail in monitor data
    const jailData = monitorData.jails.find(j => j.name === jailName);
    
    const category = inferCategory(jailName);
    const bannedIPs = jailData ? jailData.bannedIPs : [];
    const severity = inferSeverity(jailName, bannedIPs.length);
    
    const bannedIPsFormatted = bannedIPs.map(ip => ({
      ip,
      bannedAt: new Date().toISOString(),
      banCount: 1,
    }));
    
    const response = {
      name: jailName,
      enabled: bannedIPs.length > 0,
      bannedIPs: bannedIPsFormatted,
      category,
      severity,
      filter: jailName,
      maxRetry: null,
      banTime: null,
      findTime: null,
      last_activity: bannedIPsFormatted.length > 0 ? bannedIPsFormatted[0].bannedAt : null,
    };
    
    cache.set(cacheKey, response, config.cache.jailsTTL);
    res.json(response);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
