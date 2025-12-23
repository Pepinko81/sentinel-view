const express = require('express');
const router = express.Router();
const { executeScript } = require('../services/scriptExecutor');
const { runFail2banAction, verifyJailState } = require('../services/fail2banControl');
const { parseMonitorOutput, defaultMonitorOutput } = require('../services/parsers/monitorParser');
const { parseQuickCheck } = require('../services/parsers/monitorParser');
const { parseTestFail2ban } = require('../services/parsers/fail2banParser');
const { detectFail2banError, safeParse } = require('../services/parsers/parserUtils');
const { serializeJailsResponse, serializeJailResponse } = require('../services/serializers/apiSerializer');
const { inferCategory, inferSeverity } = require('../utils/jailClassifier');
const { isValidJailName } = require('../utils/validators');
const { API_VERSION } = require('../config/api');
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
      res.setHeader('X-API-Version', API_VERSION);
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
          const errorResponse = serializeJailsResponse({
            ...safeDefaults,
            errors: [errorCheck.message],
            partial: true,
            serverStatus: 'offline',
          });
          
          cache.set(cacheKey, errorResponse, config.cache.jailsTTL);
          res.setHeader('X-API-Version', API_VERSION);
          return res.json(errorResponse);
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
        
        const rawResponse = {
          jails,
          lastUpdated: new Date().toISOString(),
          serverStatus: quickData.errors && quickData.errors.length > 0 ? 'partial' : 'online',
          errors: quickData.errors || [],
          partial: quickData.partial || false,
        };
        
        const response = serializeJailsResponse(rawResponse);
        
        cache.set(cacheKey, response, config.cache.jailsTTL);
        res.setHeader('X-API-Version', API_VERSION);
        return res.json(response);
      } catch (fallbackErr) {
        console.error('Fallback script also failed:', fallbackErr.message);
        const errorResponse = serializeJailsResponse({
          ...safeDefaults,
          errors: [`Script execution failed: ${err.message}`, `Fallback failed: ${fallbackErr.message}`],
          partial: true,
        });
        
        res.setHeader('X-API-Version', API_VERSION);
        return res.json(errorResponse);
      }
    }
    
    // Check for parsing errors
    if (monitorData.errors && monitorData.errors.length > 0) {
      console.warn('Parser warnings:', monitorData.errors);
    }
    
    // ---------------------------------------------
    // JAIL STATE MODEL (STRICT, NO HEURISTICS)
    // ---------------------------------------------
    // Source of truth for enabled state:
    // - monitorData.fail2ban.jails comes from `fail2ban-client status`
    // - If a jail name is present there, command succeeded -> jail exists/enabled
    // - If a jail name is missing, it "does not exist" for our purposes
    //
    // Source of truth for banned count:
    // - monitorData.jails[].bannedCount parsed from:
    //   - "Currently banned:" (test-fail2ban.sh)
    //   - "nginx-hidden-files (1 блокирани):" (monitor-security.sh)
    //
    // We NEVER:
    // - Infer enabled from banned count or IP list
    // - Overwrite bannedCount with banned IP list length
    // - Drop jails because bannedCount = 0
    // ---------------------------------------------
    
    const configuredJails = monitorData.fail2ban?.jails || [];
    const parsedJails = monitorData.jails || [];
    
    // Optional: refine bannedCount/bannedIPs using test-fail2ban.sh (real fail2ban-client status <jail>)
    let testData = {};
    try {
      const { stdout: testStdout } = await executeScript('test-fail2ban.sh');
      testData = parseTestFail2ban(testStdout || '');
    } catch (err) {
      console.error('Failed to execute or parse test-fail2ban.sh:', err.message);
      // Do not crash jails listing – we can still use monitorData
    }
    
    // Build jails array strictly from configured (runtime) jails
    const jails = configuredJails.map(jailName => {
      const jailData = parsedJails.find(j => j.name === jailName) || {};
      const testStatus = testData[jailName] || {};
      
      // banned_count: ONLY from "Currently banned" in fail2ban-client status <jail>
      const bannedCount = typeof testStatus.bannedCount === 'number'
        ? testStatus.bannedCount
        : (typeof jailData.bannedCount === 'number' ? jailData.bannedCount : 0);
      
      // banned_ips: from Banned IP list (whitespace-separated) in fail2ban-client status <jail>,
      // or from monitorData if not available
      const bannedIPsRaw = Array.isArray(testStatus.bannedIPs)
        ? testStatus.bannedIPs
        : (Array.isArray(jailData.bannedIPs) ? jailData.bannedIPs : []);
      
      // enabled:
      // - true if jail appears in configuredJails (fail2ban reports it)
      // - false only for non-existent jails (handled with 404 in /api/jails/:name)
      const isEnabled = true;
      
      return {
        name: jailName,
        enabled: isEnabled,
        // API contract fields
        banned_count: bannedCount,
        banned_ips: bannedIPsRaw,
        // Frontend-friendly enriched structure (kept for compatibility)
        bannedIPs: bannedIPsRaw.map(ip => ({
          ip,
          bannedAt: new Date().toISOString(),
          banCount: 1,
        })),
        category: inferCategory(jailName),
        filter: jailName,
        maxRetry: null,
        banTime: null,
      };
    });
    
    // Determine server status
    let serverStatus = 'online';
    if (monitorData.partial || (monitorData.errors && monitorData.errors.length > 0)) {
      const fail2banErrors = monitorData.errors.filter(e => 
        e.includes('fail2ban') || e.includes('connection') || e.includes('service')
      );
      serverStatus = fail2banErrors.length > 0 ? 'offline' : 'partial';
    }
    
    const rawResponse = {
      jails,
      lastUpdated: new Date().toISOString(),
      serverStatus,
      errors: monitorData.errors || [],
      partial: monitorData.partial || false,
    };
    
    // Serialize to ensure exact frontend schema match
    const response = serializeJailsResponse(rawResponse);
    
    cache.set(cacheKey, response, config.cache.jailsTTL);
    res.setHeader('X-API-Version', API_VERSION);
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
      res.setHeader('X-API-Version', API_VERSION);
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
        const errorResponse = serializeJailResponse({
          ...safeDefaults,
          errors: [errorCheck.message],
          partial: true,
        });
        
        res.setHeader('X-API-Version', API_VERSION);
        return res.status(503).json(errorResponse);
      }
      
      monitorData = safeParse(parseMonitorOutput, stdout, defaultMonitorOutput);
    } catch (err) {
      const errorResponse = serializeJailResponse({
        ...safeDefaults,
        errors: [`Failed to connect to fail2ban: ${err.message}`],
        partial: true,
      });
      
      res.setHeader('X-API-Version', API_VERSION);
      return res.status(503).json(errorResponse);
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
    const bannedCount = jailData ? (jailData.bannedCount || 0) : 0;
    const bannedIPs = jailData ? (jailData.bannedIPs || []) : [];
    
    // ENABLED STATE (STRICT):
    // - Jail is enabled if it appears in fail2ban jail list (configuredJails)
    // - Banned count / IP list do NOT control enabled/disabled
    const isEnabled = (monitorData.fail2ban?.jails || []).includes(jailName);
    
    const severity = inferSeverity(jailName, bannedCount || bannedIPs.length);
    
    const bannedIPsFormatted = bannedIPs.map(ip => ({
      ip,
      bannedAt: new Date().toISOString(),
      banCount: 1,
    }));
    
    const rawResponse = {
      name: jailName,
      enabled: isEnabled,
      // API contract fields
      banned_count: bannedCount,
      banned_ips: bannedIPs,
      // Frontend-friendly enriched structure
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
    
    // Serialize to ensure exact frontend schema match
    const response = serializeJailResponse(rawResponse);
    
    cache.set(cacheKey, response, config.cache.jailsTTL);
    res.setHeader('X-API-Version', API_VERSION);
    res.json(response);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/jails/:name/enable
 * Safely enable a fail2ban jail at runtime (no config changes).
 */
router.post('/:name/enable', async (req, res, next) => {
  const jailName = req.params.name;

  try {
    if (!isValidJailName(jailName)) {
      return res.status(400).json({
        success: false,
        jail: jailName,
        status: 'disabled',
        message: 'Invalid jail name',
      });
    }

    // Ensure fail2ban is available
    if (!config.fail2banAvailable && config.nodeEnv === 'production') {
      return res.status(503).json({
        success: false,
        jail: jailName,
        status: 'disabled',
        message: 'Fail2ban is not available. Action blocked in production.',
      });
    }

    // Get current jail list from monitor-security.sh
    const { stdout, stderr } = await executeScript('monitor-security.sh');
    const errorCheck = detectFail2banError(stdout, stderr);
    if (errorCheck.isError) {
      return res.status(503).json({
        success: false,
        jail: jailName,
        status: 'disabled',
        message: `Fail2ban error: ${errorCheck.message}`,
      });
    }

    const monitorData = safeParse(parseMonitorOutput, stdout, defaultMonitorOutput);
    const configuredJails = monitorData.fail2ban?.jails || [];

    if (!configuredJails.includes(jailName)) {
      return res.status(404).json({
        success: false,
        jail: jailName,
        status: 'disabled',
        message: `Jail \"${jailName}\" does not exist in current fail2ban status`,
      });
    }

    // If jail is already enabled (present in list), treat as idempotent success
    // We still verify state explicitly after this point.
    try {
      await runFail2banAction('start', jailName);
    } catch (err) {
      return res.status(500).json({
        success: false,
        jail: jailName,
        status: 'disabled',
        message: `Failed to start jail: ${err.message}`,
      });
    }

    // Verify final state
    try {
      const state = await verifyJailState(jailName);
      const enabled = Boolean(state.enabled);

      if (!enabled) {
        return res.status(500).json({
          success: false,
          jail: jailName,
          status: 'disabled',
          message: 'Verification failed: jail is not enabled after start command',
        });
      }

      return res.json({
        success: true,
        jail: jailName,
        status: 'enabled',
        message: 'Jail enabled successfully',
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        jail: jailName,
        status: 'disabled',
        message: `Verification error: ${err.message}`,
      });
    }
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/jails/:name/disable
 * Safely disable a fail2ban jail at runtime (no config changes).
 */
router.post('/:name/disable', async (req, res, next) => {
  const jailName = req.params.name;

  try {
    if (!isValidJailName(jailName)) {
      return res.status(400).json({
        success: false,
        jail: jailName,
        status: 'enabled',
        message: 'Invalid jail name',
      });
    }

    // Ensure fail2ban is available
    if (!config.fail2banAvailable && config.nodeEnv === 'production') {
      return res.status(503).json({
        success: false,
        jail: jailName,
        status: 'enabled',
        message: 'Fail2ban is not available. Action blocked in production.',
      });
    }

    // Get current jail list from monitor-security.sh
    const { stdout, stderr } = await executeScript('monitor-security.sh');
    const errorCheck = detectFail2banError(stdout, stderr);
    if (errorCheck.isError) {
      return res.status(503).json({
        success: false,
        jail: jailName,
        status: 'enabled',
        message: `Fail2ban error: ${errorCheck.message}`,
      });
    }

    const monitorData = safeParse(parseMonitorOutput, stdout, defaultMonitorOutput);
    const configuredJails = monitorData.fail2ban?.jails || [];

    if (!configuredJails.includes(jailName)) {
      return res.status(404).json({
        success: false,
        jail: jailName,
        status: 'disabled',
        message: `Jail \"${jailName}\" does not exist in current fail2ban status`,
      });
    }

    // Issue stop command
    try {
      await runFail2banAction('stop', jailName);
    } catch (err) {
      return res.status(500).json({
        success: false,
        jail: jailName,
        status: 'enabled',
        message: `Failed to stop jail: ${err.message}`,
      });
    }

    // Verify final state (disabled or missing)
    try {
      const state = await verifyJailState(jailName);
      const enabled = Boolean(state.enabled);

      if (enabled) {
        return res.status(500).json({
          success: false,
          jail: jailName,
          status: 'enabled',
          message: 'Verification failed: jail is still enabled after stop command',
        });
      }

      return res.json({
        success: true,
        jail: jailName,
        status: 'disabled',
        message: 'Jail disabled successfully',
      });
    } catch (err) {
      // If verifyJailState treated the jail as missing/disabled, it already returned.
      // Any error reaching here is a real verification error.
      return res.status(500).json({
        success: false,
        jail: jailName,
        status: 'enabled',
        message: `Verification error: ${err.message}`,
      });
    }
  } catch (err) {
    next(err);
  }
});

module.exports = router;
