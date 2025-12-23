const express = require('express');
const router = express.Router();
const fs = require('fs');
const { executeScript } = require('../services/scriptExecutor');
const { runFail2banAction, verifyJailState, getGlobalFail2banStatus } = require('../services/fail2banControl');
const { discoverConfiguredJails, getJailRuntimeState } = require('../services/jailDiscovery');
const { ensureFilterExists, getFilterName, FILTER_TEMPLATES, getJailConfig } = require('../services/filterManager');
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
    // JAIL DISCOVERY & STATE MODEL (NEW ARCHITECTURE)
    // ---------------------------------------------
    // Source of truth for jail EXISTENCE:
    // - discoverConfiguredJails() scans /etc/fail2ban/jail.d/*.conf and jail.local
    // - This defines ALL POSSIBLE jails (configured)
    //
    // Source of truth for jail ENABLED/DISABLED:
    // - getJailRuntimeState() attempts: sudo fail2ban-client status <jail>
    // - If succeeds -> enabled = true
    // - If fails with "does not exist" -> enabled = false
    //
    // Source of truth for banned count:
    // - From parsed status output: "Currently banned" and "Total banned"
    //
    // CRITICAL:
    // - Stopped jails MUST remain visible in UI
    // - Jail NEVER disappears from API response
    // ---------------------------------------------
    
    // Discover ALL configured jails from config files (source of truth)
    let configuredJailsList = [];
    let discoveryErrors = [];
    try {
      const discoveryResult = await discoverConfiguredJails();
      configuredJailsList = discoveryResult.jails || [];
      if (discoveryResult.errors) {
        discoveryErrors = discoveryResult.errors;
      }
    } catch (err) {
      console.error('Jail discovery failed:', err.message);
      discoveryErrors.push(`Jail discovery failed: ${err.message}`);
      // Fallback to runtime list if discovery fails
      configuredJailsList = monitorData.fail2ban?.jails || [];
    }
    
    // Optional: refine bannedCount/bannedIPs using test-fail2ban.sh (real fail2ban-client status <jail>)
    let testData = {};
    try {
      const { stdout: testStdout } = await executeScript('test-fail2ban.sh');
      testData = parseTestFail2ban(testStdout || '');
    } catch (err) {
      console.error('Failed to execute or parse test-fail2ban.sh:', err.message);
      // Do not crash jails listing – we can still use runtime state checks
    }
    
    // Build jails array from ALL configured jails (not just runtime active ones)
    // For each configured jail, check runtime state
    const jails = await Promise.all(configuredJailsList.map(async (jailName) => {
      // Get runtime state for this jail
      let runtimeState;
      try {
        runtimeState = await getJailRuntimeState(jailName);
      } catch (err) {
        // If runtime check fails, assume disabled
        runtimeState = { enabled: false };
      }
      
      const isEnabled = runtimeState.enabled === true;
      const parsedJailStatus = runtimeState.status || {};
      
      // Get banned info from parsed status or test data
      const testStatus = testData[jailName] || {};
      
      // currently_banned: ONLY from "Currently banned" (runtime active bans)
      const currentlyBanned = isEnabled && parsedJailStatus.currentlyBanned !== undefined
        ? parsedJailStatus.currentlyBanned
        : (typeof testStatus.currentlyBanned === 'number'
            ? testStatus.currentlyBanned
            : (typeof testStatus.bannedCount === 'number'
                ? testStatus.bannedCount
                : (isEnabled && parsedJailStatus.bannedCount !== undefined
                    ? parsedJailStatus.bannedCount
                    : 0)));
      
      // total_banned: from "Total banned" (historical, optional, informational)
      const totalBanned = parsedJailStatus.totalBanned !== undefined
        ? parsedJailStatus.totalBanned
        : (typeof testStatus.totalBanned === 'number'
            ? testStatus.totalBanned
            : undefined);
      
      // banned_ips: from parsed status or test data
      const bannedIPsRaw = isEnabled && Array.isArray(parsedJailStatus.bannedIPs)
        ? parsedJailStatus.bannedIPs
        : (Array.isArray(testStatus.bannedIPs)
            ? testStatus.bannedIPs
            : []);
      
      return {
        name: jailName,
        enabled: isEnabled,
        configured: true, // All jails from discovery are configured
        // API contract fields - explicit semantics
        currently_banned: currentlyBanned, // Runtime active bans (used in UI)
        banned_ips: bannedIPsRaw, // Active banned IP addresses
        total_banned: totalBanned, // Historical total (optional, informational)
        // Backward compatibility aliases
        banned_count: currentlyBanned, // Deprecated: use currently_banned
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
    }));
    
    // Determine server status
    let serverStatus = 'online';
    if (monitorData.partial || (monitorData.errors && monitorData.errors.length > 0)) {
      const fail2banErrors = monitorData.errors.filter(e => 
        e.includes('fail2ban') || e.includes('connection') || e.includes('service')
      );
      serverStatus = fail2banErrors.length > 0 ? 'offline' : 'partial';
    }
    
    // Combine errors from discovery and monitor
    const allErrors = [
      ...(discoveryErrors || []),
      ...(monitorData.errors || []),
    ];
    
    const rawResponse = {
      jails,
      lastUpdated: new Date().toISOString(),
      serverStatus,
      errors: allErrors.length > 0 ? allErrors : undefined,
      partial: monitorData.partial || discoveryErrors.length > 0 || false,
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
    
    // Check if jail exists in CONFIGURATION (source of truth)
    let configuredJailsList = [];
    try {
      const discoveryResult = await discoverConfiguredJails();
      configuredJailsList = discoveryResult.jails || [];
    } catch (err) {
      // Fallback to runtime list if discovery fails
      configuredJailsList = monitorData.fail2ban?.jails || [];
    }
    
    if (!configuredJailsList.includes(jailName)) {
      return res.status(404).json({
        error: `Jail "${jailName}" is not configured in fail2ban`,
        code: 'JAIL_NOT_FOUND',
        errors: monitorData.errors || [],
      });
    }
    
    // Get runtime state for this jail
    let runtimeState;
    try {
      runtimeState = await getJailRuntimeState(jailName);
    } catch (err) {
      // If runtime check fails, assume disabled
      runtimeState = { enabled: false };
    }
    
    const isEnabled = runtimeState.enabled === true;
    const parsedJailStatus = runtimeState.status || {};
    
    // Find jail in monitor data for additional info
    const jailData = (monitorData.jails || []).find(j => j.name === jailName);
    
    const category = inferCategory(jailName);
    // Use parsed status first, then fallback to monitor data
    const bannedCount = parsedJailStatus.currentlyBanned !== undefined
      ? parsedJailStatus.currentlyBanned
      : (jailData ? (jailData.bannedCount || 0) : 0);
    const bannedIPs = Array.isArray(parsedJailStatus.bannedIPs) && parsedJailStatus.bannedIPs.length > 0
      ? parsedJailStatus.bannedIPs
      : (jailData ? (jailData.bannedIPs || []) : []);
    
    const severity = inferSeverity(jailName, bannedCount || bannedIPs.length);
    
    const bannedIPsFormatted = bannedIPs.map(ip => ({
      ip,
      bannedAt: new Date().toISOString(),
      banCount: 1,
    }));
    
    const rawResponse = {
      name: jailName,
      enabled: isEnabled,
      configured: true, // All jails from discovery are configured
      // API contract fields
      currently_banned: bannedCount,
      banned_ips: bannedIPs,
      banned_count: bannedCount, // Backward compatibility
      // Frontend-friendly enriched structure
      bannedIPs: bannedIPsFormatted,
      category,
      severity,
      filter: jailName,
      maxRetry: parsedJailStatus.maxRetry || null,
      banTime: parsedJailStatus.banTime || null,
      findTime: parsedJailStatus.findTime || null,
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

  console.log(`[JAIL ENABLE] Starting enable process for jail: ${jailName}`);

  try {
    if (!isValidJailName(jailName)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid jail name',
      });
    }

    // Validate jail exists in CONFIGURATION (not runtime)
    // This allows disabling jails even if they're already stopped
    let configuredJailsList = [];
    try {
      const discoveryResult = await discoverConfiguredJails();
      configuredJailsList = discoveryResult.jails || [];
      console.log(`[JAIL ENABLE] Discovered ${configuredJailsList.length} configured jails`);
    } catch (err) {
      console.error(`[JAIL ENABLE] Failed to discover jails:`, err);
      return res.status(503).json({
        success: false,
        error: `Failed to discover configured jails: ${err.message}`,
      });
    }

    if (!configuredJailsList.includes(jailName)) {
      console.warn(`[JAIL ENABLE] Jail ${jailName} not found in configured jails list`);
      return res.status(404).json({
        success: false,
        error: `Jail "${jailName}" is not configured in fail2ban`,
      });
    }

    console.log(`[JAIL ENABLE] Jail ${jailName} found in configuration, checking filter file...`);

    // Ensure filter file exists before attempting to start
    // This prevents "jail does not exist" errors when filter is missing
    let filterCheck;
    try {
      filterCheck = await ensureFilterExists(jailName);
      
      // Log filter check result
      console.log(`[JAIL ENABLE] Filter check for ${jailName}:`, {
        filterName: filterCheck.filterName,
        exists: filterCheck.exists,
        created: filterCheck.created,
        message: filterCheck.message,
      });
      
      if (!filterCheck.exists && !filterCheck.created) {
        // Filter file doesn't exist and couldn't be created automatically
        const hasTemplate = filterCheck.filterName && filterCheck.filterName in FILTER_TEMPLATES;
        
        return res.status(500).json({
          success: false,
          error: `Filter file missing: ${filterCheck.filterName || 'unknown'}.conf`,
          details: {
            filterName: filterCheck.filterName,
            message: filterCheck.message,
            suggestion: hasTemplate
              ? 'Filter template exists but creation failed. Check sudo permissions and backend logs.'
              : `No template available for filter "${filterCheck.filterName}". Please create /etc/fail2ban/filter.d/${filterCheck.filterName}.conf manually.`,
            troubleshooting: hasTemplate
              ? [
                  '1. Check backend logs for filter creation errors',
                  '2. Verify sudoers includes SENTINEL_FILTER_MGMT',
                  '3. Test manually: sudo /home/pepinko/sentinel-view/backend/scripts/create-filter-file.sh <filter-name> <temp-file>',
                  '4. Check script permissions: ls -la backend/scripts/create-filter-file.sh',
                ]
              : [
                  `1. Create filter file manually: sudo nano /etc/fail2ban/filter.d/${filterCheck.filterName}.conf`,
                  '2. Use existing filter as template',
                  '3. Test filter: sudo fail2ban-regex /var/log/nginx/access.log /etc/fail2ban/filter.d/<filter>.conf',
                ],
          },
        });
      }
      
      // If filter was just created, log it
      if (filterCheck.created) {
        console.log(`[JAIL ENABLE] ✅ Auto-created filter file: ${filterCheck.filterName}.conf`);
      } else if (filterCheck.exists) {
        console.log(`[JAIL ENABLE] ✅ Filter file already exists: ${filterCheck.filterName}.conf`);
      }
    } catch (err) {
      // If filter check fails completely, return error instead of trying to start
      console.error(`[JAIL ENABLE] ❌ Filter check failed for ${jailName}:`, err);
      return res.status(500).json({
        success: false,
        error: `Failed to check/create filter file: ${err.message}`,
        details: {
          jailName,
          suggestion: 'Check backend logs for details. Filter file may need to be created manually.',
        },
      });
    }

    // Validate jail configuration before attempting to start
    // Check if logpath exists (if specified)
    try {
      const jailConfig = await getJailConfig(jailName);
      
      if (jailConfig && jailConfig.config) {
        const logpath = jailConfig.config.logpath;
        if (logpath) {
          // logpath can be a single path or multiple paths separated by space
          const logPaths = logpath.split(/\s+/).filter(p => p.trim());
          
          for (const logPath of logPaths) {
            if (!fs.existsSync(logPath)) {
              console.warn(`[JAIL ENABLE] ⚠️ Log path does not exist: ${logPath}`);
              // Don't fail here - fail2ban will handle this, but log it
            } else {
              console.log(`[JAIL ENABLE] ✅ Log path exists: ${logPath}`);
            }
          }
        }
      }
    } catch (configErr) {
      console.warn(`[JAIL ENABLE] Could not validate jail configuration: ${configErr.message}`);
    }

    // Execute start command
    console.log(`[JAIL ENABLE] Attempting to start jail: ${jailName}`);
    try {
      await runFail2banAction('start', jailName);
      console.log(`[JAIL ENABLE] ✅ Successfully started jail: ${jailName}`);
    } catch (err) {
      console.error(`[JAIL ENABLE] ❌ Failed to start jail ${jailName}:`, err);
      
      // Provide more helpful error message if jail doesn't exist
      const errorMessage = err.message || '';
      if (errorMessage.includes('does not exist') || errorMessage.includes('NOK')) {
        // Try to get filter name and jail config for better error message
        let filterName = null;
        let jailConfig = null;
        let logpath = null;
        
        try {
          filterName = await getFilterName(jailName);
          jailConfig = await getJailConfig(jailName);
          if (jailConfig && jailConfig.config) {
            logpath = jailConfig.config.logpath;
          }
        } catch (configErr) {
          console.warn(`[JAIL ENABLE] Could not get jail config for error message: ${configErr.message}`);
        }
        
        // Build troubleshooting suggestions
        const suggestions = [];
        
        if (filterName) {
          const filterPath = `/etc/fail2ban/filter.d/${filterName}.conf`;
          suggestions.push(`1. Verify filter file exists and is valid: ls -la ${filterPath}`);
          suggestions.push(`2. Test filter syntax: sudo fail2ban-regex --test-filter ${filterPath}`);
        }
        
        if (logpath) {
          const logPaths = logpath.split(/\s+/).filter(p => p.trim());
          for (const logPath of logPaths) {
            suggestions.push(`3. Verify log path exists: ls -la ${logPath}`);
          }
        }
        
        suggestions.push('4. Check fail2ban logs: sudo tail -50 /var/log/fail2ban.log | grep -i "' + jailName + '"');
        suggestions.push('5. Try restarting fail2ban: sudo systemctl restart fail2ban');
        
        return res.status(500).json({
          success: false,
          error: `Failed to start jail: ${errorMessage}`,
          details: {
            jailName,
            filterName: filterName || 'unknown',
            logpath: logpath || 'not specified',
            commonCauses: [
              'Filter file syntax error',
              'Log path does not exist or is not accessible',
              'Jail configuration error',
              'fail2ban service needs restart after filter changes',
            ],
            troubleshooting: suggestions,
          },
        });
      }
      
      return res.status(500).json({
        success: false,
        error: `Failed to start jail: ${err.message}`,
        details: {
          jailName,
          suggestion: 'Check backend logs and fail2ban logs for details',
        },
      });
    }

    // Verify final state
    try {
      const state = await verifyJailState(jailName);
      const enabled = Boolean(state.enabled);

      if (!enabled) {
        return res.status(500).json({
          success: false,
          error: 'Verification failed: jail is not enabled after start command',
        });
      }

      return res.json({
        success: true,
        jail: jailName,
        enabled: true,
        message: 'Jail enabled',
      });
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: `Verification error: ${err.message}`,
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
        error: 'Invalid jail name',
      });
    }

    // Validate jail exists in CONFIGURATION (not runtime)
    // This allows disabling jails even if they're already stopped
    let configuredJailsList = [];
    try {
      const discoveryResult = await discoverConfiguredJails();
      configuredJailsList = discoveryResult.jails || [];
    } catch (err) {
      return res.status(503).json({
        success: false,
        error: `Failed to discover configured jails: ${err.message}`,
      });
    }

    if (!configuredJailsList.includes(jailName)) {
      return res.status(404).json({
        success: false,
        error: `Jail "${jailName}" is not configured in fail2ban`,
      });
    }

    // Issue stop command
    try {
      await runFail2banAction('stop', jailName);
    } catch (err) {
      return res.status(500).json({
        success: false,
        error: `Failed to stop jail: ${err.message}`,
      });
    }

    // Verify final state (disabled or missing)
    try {
      const state = await verifyJailState(jailName);
      const enabled = Boolean(state.enabled);

      if (enabled) {
        return res.status(500).json({
          success: false,
          error: 'Verification failed: jail is still enabled after stop command',
        });
      }

      return res.json({
        success: true,
        jail: jailName,
        enabled: false,
        message: 'Jail disabled',
      });
    } catch (err) {
      // If verifyJailState treated the jail as missing/disabled, it already returned.
      // Any error reaching here is a real verification error.
      return res.status(500).json({
        success: false,
        error: `Verification error: ${err.message}`,
      });
    }
  } catch (err) {
    next(err);
  }
});

module.exports = router;
