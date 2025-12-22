const express = require('express');
const router = express.Router();
const { executeScript } = require('../services/scriptExecutor');
const { parseMonitorOutput, defaultMonitorOutput } = require('../services/parsers/monitorParser');
const { parseQuickCheck } = require('../services/parsers/monitorParser');
const { parseFail2banStatus, extractJailNames, defaultFail2banStatus } = require('../services/parsers/fail2banParser');
const { detectFail2banError, safeParse } = require('../services/parsers/parserUtils');
const { inferCategory, inferSeverity } = require('../utils/jailClassifier');
const { isValidJailName } = require('../utils/validators');
const cache = require('../services/cache');
const config = require('../config/config');

/**
 * GET /api/jails
 * Returns dynamic list of all jails
 * Uses monitor-security.sh to get comprehensive jail data
 * Handles fail2ban downtime gracefully
 */
router.get('/', async (req, res, next) => {
  try {
    const cacheKey = 'jails';
    const cached = cache.get(cacheKey);
    
    if (cached) {
      return res.json(cached);
    }
    
    // Safe defaults
    const safeDefaults = {
      jails: [],
      lastUpdated: new Date().toISOString(),
      serverStatus: 'offline',
      errors: [],
      partial: false,
    };
    
    // Use monitor-security.sh for comprehensive data
    let monitorData = null;
    
    try {
      const { stdout, stderr } = await executeScript('monitor-security.sh');
      
      // Check for fail2ban errors
      const errorCheck = detectFail2banError(stdout, stderr);
      if (errorCheck.isError) {
        console.warn('fail2ban error detected:', errorCheck.message);
        
        // Try to parse what we can
        monitorData = safeParse(parseMonitorOutput, stdout, defaultMonitorOutput);
        monitorData.errors = monitorData.errors || [];
        monitorData.errors.push(errorCheck.message);
        monitorData.partial = true;
      } else {
        monitorData = safeParse(parseMonitorOutput, stdout, defaultMonitorOutput);
      }
    } catch (err) {
      console.error('Failed to execute monitor-security.sh:', err.message);
      
      // Fallback: try quick-check.sh
      try {
        const { stdout: quickOutput, stderr: quickStderr } = await executeScript('quick-check.sh');
        
        const errorCheck = detectFail2banError(quickOutput, quickStderr);
        if (errorCheck.isError) {
          return res.json({
            ...safeDefaults,
            errors: [errorCheck.message],
            partial: true,
            serverStatus: 'offline',
          });
        }
        
        const quickData = safeParse(parseQuickCheck, quickOutput, {
          jails: [],
          bannedCount: 0,
          recentAttacks: 0,
          errors: 0,
        });
        
        // Create minimal jail entries
        const jails = (quickData.jails || []).map(jailName => ({
          name: jailName,
          enabled: false,
          bannedIPs: [],
          category: inferCategory(jailName),
          filter: jailName,
        }));
        
        const response = {
          jails,
          lastUpdated: new Date().toISOString(),
          serverStatus: quickData.errors && quickData.errors.length > 0 ? 'partial' : 'online',
          errors: quickData.errors || [],
          partial: quickData.partial || false,
        };
        
        cache.set(cacheKey, response, config.cache.jailsTTL);
        return res.json(response);
      } catch (fallbackErr) {
        console.error('Fallback script also failed:', fallbackErr.message);
        return res.json({
          ...safeDefaults,
          errors: [`Script execution failed: ${err.message}`, `Fallback failed: ${fallbackErr.message}`],
          partial: true,
        });
      }
    }
    
    // Check for parsing errors
    if (monitorData.errors && monitorData.errors.length > 0) {
      console.warn('Parser warnings:', monitorData.errors);
    }
    
    // Transform monitor data to frontend format
    const jails = (monitorData.jails || []).map(jail => ({
      name: jail.name,
      enabled: (jail.bannedIPs && jail.bannedIPs.length > 0) || (jail.bannedCount > 0) || false,
      bannedIPs: (jail.bannedIPs || []).map(ip => ({
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
    const configuredJails = monitorData.fail2ban?.jails || [];
    for (const jailName of configuredJails) {
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
    
    // Determine server status
    let serverStatus = 'online';
    if (monitorData.partial || (monitorData.errors && monitorData.errors.length > 0)) {
      const fail2banErrors = monitorData.errors.filter(e => 
        e.includes('fail2ban') || e.includes('connection') || e.includes('service')
      );
      serverStatus = fail2banErrors.length > 0 ? 'offline' : 'partial';
    }
    
    const response = {
      jails,
      lastUpdated: new Date().toISOString(),
      serverStatus,
      errors: monitorData.errors || [],
      partial: monitorData.partial || false,
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
 * Handles fail2ban downtime gracefully
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
    
    // Safe defaults
    const safeDefaults = {
      name: jailName,
      enabled: false,
      bannedIPs: [],
      category: inferCategory(jailName),
      severity: 'low',
      filter: jailName,
      maxRetry: null,
      banTime: null,
      findTime: null,
      last_activity: null,
      errors: [],
      partial: false,
    };
    
    // First check if jail exists using monitor-security.sh
    let monitorData = null;
    
    try {
      const { stdout, stderr } = await executeScript('monitor-security.sh');
      
      // Check for fail2ban errors
      const errorCheck = detectFail2banError(stdout, stderr);
      if (errorCheck.isError) {
        return res.status(503).json({
          ...safeDefaults,
          errors: [errorCheck.message],
          partial: true,
        });
      }
      
      monitorData = safeParse(parseMonitorOutput, stdout, defaultMonitorOutput);
    } catch (err) {
      return res.status(503).json({
        ...safeDefaults,
        errors: [`Failed to connect to fail2ban: ${err.message}`],
        partial: true,
      });
    }
    
    // Check if jail exists
    const configuredJails = monitorData.fail2ban?.jails || [];
    if (!configuredJails.includes(jailName)) {
      return res.status(404).json({
        error: `Jail "${jailName}" not found`,
        code: 'JAIL_NOT_FOUND',
        errors: monitorData.errors || [],
      });
    }
    
    // Find jail in monitor data
    const jailData = (monitorData.jails || []).find(j => j.name === jailName);
    
    const category = inferCategory(jailName);
    const bannedIPs = jailData ? (jailData.bannedIPs || []) : [];
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
      errors: monitorData.errors || [],
      partial: monitorData.partial || false,
    };
    
    cache.set(cacheKey, response, config.cache.jailsTTL);
    res.json(response);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
