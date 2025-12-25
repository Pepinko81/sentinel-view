const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const { execFile } = require('child_process');
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

const execFileAsync = promisify(execFile);

// Absolute paths
const SUDO_PATH = process.env.SUDO_PATH || '/usr/bin/sudo';
const FAIL2BAN_CONFIG_DIR = process.env.FAIL2BAN_CONFIG_DIR || '/etc/fail2ban';
const FAIL2BAN_CLIENT_PATH = process.env.FAIL2BAN_CLIENT_PATH || '/usr/bin/fail2ban-client';
const FAIL2BAN_FILTER_DIR = path.join(FAIL2BAN_CONFIG_DIR, 'filter.d');
const FAIL2BAN_JAIL_D_DIR = path.join(FAIL2BAN_CONFIG_DIR, 'jail.d');

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
    
    // Return cached data immediately (performance optimization)
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
    
    // Skip monitor-security.sh for performance - use direct fail2ban-client calls instead
    // This is much faster than executing bash scripts
    let monitorData = {
      fail2ban: { jails: [] },
      jails: [],
      errors: [],
      partial: false,
    };
    
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
    
    // Discovery already done above in parallel
    
    // Get active jails from fail2ban-client status (runtime state)
    // Do this in parallel with jail discovery for performance
    let activeJailsList = [];
    const [discoveryResult, globalStatusResult] = await Promise.allSettled([
      discoverConfiguredJails(),
      getGlobalFail2banStatus().catch(err => {
        // Silently fail - we'll continue without active jails list
        return { jails: [] };
      })
    ]);
    
    // Extract results
    let configuredJailsList = [];
    let discoveryErrors = [];
    if (discoveryResult.status === 'fulfilled') {
      configuredJailsList = discoveryResult.value.jails || [];
      if (discoveryResult.value.errors) {
        discoveryErrors = discoveryResult.value.errors;
      }
    } else {
      console.error('Jail discovery failed:', discoveryResult.reason?.message);
      discoveryErrors.push(`Jail discovery failed: ${discoveryResult.reason?.message}`);
    }
    
    if (globalStatusResult.status === 'fulfilled') {
      activeJailsList = globalStatusResult.value.jails || [];
      if (process.env.NODE_ENV === 'development') {
        console.log(`[JAILS API] Found ${activeJailsList.length} active jails: ${activeJailsList.join(', ')}`);
      }
    } else {
      // Silently continue - fail2ban may be down
    }
    
    // Build jails array from ALL configured jails (source of truth)
    // For each configured jail, check runtime state and get REAL banned count
    // Only check runtime state for active jails (performance optimization)
    const jails = await Promise.all(configuredJailsList.map(async (jailName) => {
      // Determine status: ENABLED if in active list, DISABLED otherwise
      const isEnabled = activeJailsList.includes(jailName);
      
      // Get REAL banned count and IPs via fail2ban-client status <jail>
      // This is the ONLY reliable source for banned IPs
      let currentlyBanned = 0;
      let bannedIPsRaw = [];
      let totalBanned = undefined;
      
      if (isEnabled) {
        // Jail is active - get real status (with timeout handled by getJailRuntimeState)
        // Use shorter timeout for performance (5s instead of default)
        try {
          const runtimeState = await getJailRuntimeState(jailName);
          if (runtimeState.enabled && runtimeState.status) {
            const parsedStatus = runtimeState.status;
            currentlyBanned = typeof parsedStatus.currentlyBanned === 'number' 
              ? parsedStatus.currentlyBanned 
              : (typeof parsedStatus.bannedCount === 'number' ? parsedStatus.bannedCount : 0);
            bannedIPsRaw = Array.isArray(parsedStatus.bannedIPs) ? parsedStatus.bannedIPs : [];
            totalBanned = parsedStatus.totalBanned;
          }
        } catch (err) {
          // If status check fails for active jail (timeout or error), use defaults
          // Don't log warnings for timeouts in production (too noisy)
          if (process.env.NODE_ENV === 'development') {
            const isTimeout = err.killed === true || err.code === 'ETIMEDOUT';
            console.warn(`[JAILS API] ${isTimeout ? 'Timeout' : 'Failed'} getting status for active jail ${jailName}: ${err.message}`);
          }
          currentlyBanned = 0; // Default to 0 if we can't get status
          bannedIPsRaw = [];
        }
      } else {
        // Jail is disabled - banned count is always 0 (no need to check)
        currentlyBanned = 0;
        bannedIPsRaw = [];
      }
      
      return {
        name: jailName,
        enabled: isEnabled,
        configured: true, // All jails from discovery are configured
        status: isEnabled ? 'ENABLED' : 'DISABLED', // Explicit status field
        
        // STRICT API CONTRACT: Clear separation of active vs historical bans
        active_bans: {
          count: currentlyBanned, // ONLY from "Currently banned" (runtime state)
          ips: bannedIPsRaw, // ONLY from "Banned IP list" (runtime state)
        },
        
        historical_bans: {
          total: totalBanned !== undefined ? totalBanned : null, // ONLY from "Total banned" (historical)
        },
        
        // Backward compatibility aliases (deprecated - use active_bans instead)
        currently_banned: currentlyBanned,
        banned_ips: bannedIPsRaw,
        total_banned: totalBanned,
        banned_count: currentlyBanned,
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

    // Check if jail is already enabled before attempting to start
    let alreadyEnabled = false;
    try {
      const globalStatus = await getGlobalFail2banStatus();
      alreadyEnabled = (globalStatus.jails || []).includes(jailName);
      if (alreadyEnabled) {
        console.log(`[JAIL ENABLE] Jail ${jailName} is already enabled`);
        return res.json({
          success: true,
          jail: jailName,
          enabled: true,
          status: 'ENABLED',
          message: 'Jail is already enabled',
        });
      }
    } catch (statusErr) {
      console.warn(`[JAIL ENABLE] Could not check current state: ${statusErr.message}`);
    }

    // Execute start command with ignoreNOK=true (idempotent)
    console.log(`[JAIL ENABLE] Attempting to start jail: ${jailName}`);
    try {
      const actionResult = await runFail2banAction('start', jailName, true); // ignoreNOK = true
      console.log(`[JAIL ENABLE] Start command executed, NOK: ${actionResult.nok}`);
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

    // Verify final state - wait a moment for state to settle
    await new Promise(resolve => setTimeout(resolve, 200));

    try {
      const globalStatus = await getGlobalFail2banStatus();
      const enabled = (globalStatus.jails || []).includes(jailName);

      if (!enabled) {
        // If we got NOK, jail might already be enabled (idempotent case)
        if (actionResult.nok) {
          // Double-check with individual status
          try {
            const runtimeState = await getJailRuntimeState(jailName);
            if (runtimeState.enabled) {
              return res.json({
                success: true,
                jail: jailName,
                enabled: true,
                status: 'ENABLED',
                message: 'Jail enabled (was already enabled)',
                nokIgnored: true,
              });
            }
          } catch (checkErr) {
            // Continue to error
          }
        }

        return res.status(500).json({
          success: false,
          error: 'Verification failed: jail is not enabled after start command',
          details: {
            jailName,
            nokReceived: actionResult.nok,
          },
        });
      }

      return res.json({
        success: true,
        jail: jailName,
        enabled: true,
        status: 'ENABLED',
        message: 'Jail enabled',
        nokIgnored: actionResult.nok,
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

    // Check if jail is already disabled before attempting to stop
    let alreadyDisabled = false;
    try {
      const globalStatus = await getGlobalFail2banStatus();
      alreadyDisabled = !(globalStatus.jails || []).includes(jailName);
      if (alreadyDisabled) {
        console.log(`[JAIL DISABLE] Jail ${jailName} is already disabled`);
        return res.json({
          success: true,
          jail: jailName,
          enabled: false,
          status: 'DISABLED',
          message: 'Jail is already disabled',
        });
      }
    } catch (statusErr) {
      console.warn(`[JAIL DISABLE] Could not check current state: ${statusErr.message}`);
    }

    // Issue stop command with ignoreNOK=true (idempotent)
    try {
      const actionResult = await runFail2banAction('stop', jailName, true); // ignoreNOK = true
      console.log(`[JAIL DISABLE] Stop command executed, NOK: ${actionResult.nok}`);
    } catch (err) {
      // Check if it's a NOK error (jail already stopped)
      const isNOK = (err.message || '').toLowerCase().includes('nok');
      if (isNOK) {
        console.log(`[JAIL DISABLE] Received NOK on stop - jail may already be disabled`);
        // Continue to verification
      } else {
        return res.status(500).json({
          success: false,
          error: `Failed to stop jail: ${err.message}`,
        });
      }
    }

    // Verify final state - wait a moment for state to settle
    await new Promise(resolve => setTimeout(resolve, 200));

    // Verify final state (disabled or missing)
    try {
      const globalStatus = await getGlobalFail2banStatus();
      const enabled = (globalStatus.jails || []).includes(jailName);

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
        status: 'DISABLED',
        message: 'Jail disabled',
      });
    } catch (err) {
      // If we can't verify via global status, assume disabled (jail disappeared from list)
      console.warn(`[JAIL DISABLE] Could not verify via global status, assuming disabled: ${err.message}`);
      return res.json({
        success: true,
        jail: jailName,
        enabled: false,
        status: 'DISABLED',
        message: 'Jail disabled',
      });
    }
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/jails/:name/toggle
 * Idempotent toggle endpoint - safely enables or disables a jail
 * Handles NOK responses correctly (NOK is not always an error)
 */
router.post('/:name/toggle', async (req, res, next) => {
  const jailName = req.params.name;

  console.log(`[JAIL TOGGLE] Starting toggle for jail: ${jailName}`);

  try {
    if (!isValidJailName(jailName)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid jail name',
      });
    }

    // Validate jail exists in CONFIGURATION
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

    // Get current state by checking if jail is in active list
    let currentState;
    try {
      const globalStatus = await getGlobalFail2banStatus();
      const activeJails = globalStatus.jails || [];
      currentState = activeJails.includes(jailName) ? 'ENABLED' : 'DISABLED';
      console.log(`[JAIL TOGGLE] Current state for ${jailName}: ${currentState}`);
    } catch (err) {
      // If we can't get global status, try individual status
      try {
        const runtimeState = await getJailRuntimeState(jailName);
        currentState = runtimeState.enabled ? 'ENABLED' : 'DISABLED';
      } catch (stateErr) {
        // Assume disabled if we can't determine
        currentState = 'DISABLED';
        console.warn(`[JAIL TOGGLE] Could not determine current state, assuming DISABLED: ${stateErr.message}`);
      }
    }

    // Determine target state
    const targetState = currentState === 'ENABLED' ? 'DISABLED' : 'ENABLED';
    const action = targetState === 'ENABLED' ? 'start' : 'stop';

    console.log(`[JAIL TOGGLE] Target state: ${targetState}, Action: ${action}`);

    // Ensure filter file exists before attempting to start
    if (action === 'start') {
      try {
        const filterCheck = await ensureFilterExists(jailName);
        if (!filterCheck.exists && !filterCheck.created) {
          return res.status(500).json({
            success: false,
            error: `Filter file missing: ${filterCheck.filterName || 'unknown'}.conf`,
            details: {
              filterName: filterCheck.filterName,
              message: filterCheck.message,
            },
          });
        }
      } catch (filterErr) {
        console.warn(`[JAIL TOGGLE] Filter check failed: ${filterErr.message}`);
        // Continue anyway - maybe filter exists but check failed
      }
    }

    // Execute action with ignoreNOK=true for idempotent behavior
    // NOK is OK if jail is already in desired state
    let actionResult;
    try {
      actionResult = await runFail2banAction(action, jailName, true); // ignoreNOK = true
      console.log(`[JAIL TOGGLE] Action ${action} executed, NOK: ${actionResult.nok}, Killed: ${actionResult.killed}`);
    } catch (err) {
      // Check if it's a NOK error or killed process
      const isNOK = (err.message || '').toLowerCase().includes('nok');
      const wasKilled = err.killed === true || err.signal !== null;
      
      if (isNOK || wasKilled) {
        console.log(`[JAIL TOGGLE] Received ${wasKilled ? 'killed' : 'NOK'} for ${action}, checking if jail is in desired state`);
        actionResult = { stdout: '', stderr: err.message, nok: true, killed: wasKilled };
      } else {
        throw err;
      }
    }

    // Verify final state - wait a moment for state to settle
    await new Promise(resolve => setTimeout(resolve, 200));

    let finalState;
    let verificationFailed = false;
    try {
      const globalStatus = await getGlobalFail2banStatus();
      const activeJails = globalStatus.jails || [];
      finalState = activeJails.includes(jailName) ? 'ENABLED' : 'DISABLED';
      
      // Check if we achieved the target state
      if (finalState !== targetState) {
        // If we got NOK/killed and jail is already in target state, that's OK
        // This handles idempotent cases where jail was already in desired state
        if ((actionResult.nok || actionResult.killed) && finalState === currentState) {
          console.log(`[JAIL TOGGLE] ${actionResult.killed ? 'Killed' : 'NOK'} received but jail already in target state - success`);
          // Jail is already in desired state, consider it success
          finalState = targetState;
        } else {
          verificationFailed = true;
          console.warn(`[JAIL TOGGLE] Verification failed: expected ${targetState}, got ${finalState}`);
        }
      } else {
        console.log(`[JAIL TOGGLE] ✅ Successfully ${action === 'start' ? 'enabled' : 'disabled'} jail: ${jailName}`);
      }
    } catch (verifyErr) {
      // If verification fails, check individual status
      try {
        const runtimeState = await getJailRuntimeState(jailName);
        finalState = runtimeState.enabled ? 'ENABLED' : 'DISABLED';
        if (finalState !== targetState && !(actionResult.nok && finalState === currentState)) {
          verificationFailed = true;
        }
      } catch (stateErr) {
        // If we can't verify, but got NOK and action was stop, assume success
        if (action === 'stop' && actionResult.nok) {
          finalState = 'DISABLED';
          console.log(`[JAIL TOGGLE] Cannot verify but got NOK on stop - assuming disabled`);
        } else {
          verificationFailed = true;
        }
      }
    }

    if (verificationFailed) {
      return res.status(500).json({
        success: false,
        error: `Failed to ${action} jail. Current state: ${finalState || 'unknown'}, Expected: ${targetState}`,
        details: {
          jailName,
          currentState: finalState || 'unknown',
          targetState,
          action,
          nokReceived: actionResult.nok,
        },
      });
    }

    return res.json({
      success: true,
      jail: jailName,
      enabled: finalState === 'ENABLED',
      status: finalState,
      message: `Jail ${finalState === 'ENABLED' ? 'enabled' : 'disabled'} successfully`,
      nokIgnored: actionResult.nok,
    });
  } catch (err) {
    console.error(`[JAIL TOGGLE] ❌ Error toggling jail ${jailName}:`, err);
    next(err);
  }
});

/**
 * POST /api/jails/create
 * Create a new fail2ban jail configuration
 * Payload:
 * {
 *   name: string (required),
 *   filter: string (required),
 *   logpath: string (required),
 *   maxretry?: number (default: 3),
 *   findtime?: number (default: 600),
 *   bantime?: number (default: 3600),
 *   action?: string (default: "iptables-multiport")
 * }
 */
router.post('/create', async (req, res, next) => {
  try {
    const { name, filter, logpath, maxretry, findtime, bantime, action } = req.body;

    // Validate required fields
    if (!name || typeof name !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Jail name is required',
      });
    }

    if (!filter || typeof filter !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Filter name is required',
      });
    }

    if (!logpath || typeof logpath !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Log path is required',
      });
    }

    // Validate jail name format
    if (!isValidJailName(name)) {
      return res.status(400).json({
        success: false,
        error: `Invalid jail name: "${name}". Jail names must contain only alphanumeric characters, dots, dashes, and underscores.`,
      });
    }

    console.log(`[JAIL CREATE] Creating jail: ${name}`);

    // Check if jail already exists (in configuration files)
    const configuredJails = await discoverConfiguredJails();
    if (configuredJails.jails && configuredJails.jails.includes(name)) {
      // Check if it's in jail.d (user-created) or jail.conf (system default)
      const configFilePath = path.join(FAIL2BAN_JAIL_D_DIR, `${name}.conf`);
      const isUserCreated = fs.existsSync(configFilePath);
      
      return res.status(409).json({
        success: false,
        error: `Jail "${name}" already exists in configuration.`,
        details: {
          jailName: name,
          location: isUserCreated ? `User-created: ${configFilePath}` : `System default: /etc/fail2ban/jail.conf`,
          suggestion: isUserCreated 
            ? `Use a different name, or delete the existing jail configuration file: ${configFilePath}`
            : `Use a different name. This jail is defined in the system default configuration.`,
        },
      });
    }

    // Check if config file already exists
    const configFilePath = path.join(FAIL2BAN_JAIL_D_DIR, `${name}.conf`);
    if (fs.existsSync(configFilePath)) {
      return res.status(409).json({
        success: false,
        error: `Jail configuration file already exists: ${configFilePath}`,
        details: {
          jailName: name,
          configFile: configFilePath,
          suggestion: 'Use a different name or remove the existing file manually.',
        },
      });
    }

    // Validate filter exists
    const filterPath = path.join(FAIL2BAN_FILTER_DIR, `${filter}.conf`);
    try {
      // Try direct file check first (if readable without sudo)
      if (fs.existsSync(filterPath)) {
        console.log(`[JAIL CREATE] ✅ Filter file exists (direct check): ${filterPath}`);
      } else {
        // Try with sudo
        await execFileAsync(SUDO_PATH, ['test', '-f', filterPath], { timeout: 5000 });
        console.log(`[JAIL CREATE] ✅ Filter file exists (sudo check): ${filterPath}`);
      }
    } catch (err) {
      console.error(`[JAIL CREATE] ❌ Filter file check failed: ${err.message}`);
      return res.status(400).json({
        success: false,
        error: `Filter file does not exist or is not accessible: ${filterPath}`,
        details: {
          filterName: filter,
          filterPath: filterPath,
          suggestion: `Create the filter file first: /etc/fail2ban/filter.d/${filter}.conf`,
          note: 'Check if the filter file exists and has correct permissions.',
        },
      });
    }

    // Validate logpath exists (use test -f for files, test -d for directories)
    // Try direct check first (if readable without sudo)
    let logpathExists = false;
    let logpathWarning = null;
    
    try {
      // Try direct file check first
      if (fs.existsSync(logpath)) {
        logpathExists = true;
        console.log(`[JAIL CREATE] ✅ Logpath exists (direct check, file): ${logpath}`);
      } else {
        // Try with sudo
        try {
          await execFileAsync(SUDO_PATH, ['test', '-f', logpath], { timeout: 5000 });
          logpathExists = true;
          console.log(`[JAIL CREATE] ✅ Logpath exists (sudo check, file): ${logpath}`);
        } catch (fileErr) {
          // If not a file, try as directory (for log rotation patterns like /var/log/nginx/*.log)
          try {
            const logDir = path.dirname(logpath);
            // Check directory directly first
            if (fs.existsSync(logDir) && fs.statSync(logDir).isDirectory()) {
              logpathExists = true;
              logpathWarning = `Log file does not exist yet, but directory exists: ${logDir}. The log file will be created when the service starts.`;
              console.log(`[JAIL CREATE] ⚠️ Logpath directory exists, but file not found: ${logpath}`);
            } else {
              // Try with sudo
              await execFileAsync(SUDO_PATH, ['test', '-d', logDir], { timeout: 5000 });
              logpathExists = true;
              logpathWarning = `Log file does not exist yet, but directory exists: ${logDir}. The log file will be created when the service starts.`;
              console.log(`[JAIL CREATE] ⚠️ Logpath directory exists (sudo), but file not found: ${logpath}`);
            }
            // Also check if it's a wildcard pattern
            if (logpath.includes('*')) {
              logpathWarning = `Logpath contains wildcard pattern: ${logpath}. Ensure the directory exists and files matching the pattern will be created.`;
              console.log(`[JAIL CREATE] ⚠️ Logpath contains wildcard pattern: ${logpath}`);
            }
          } catch (dirErr) {
            // Directory doesn't exist either - this is a real problem
            return res.status(400).json({
              success: false,
              error: `Log path does not exist and directory is not accessible: ${logpath}`,
              details: {
                logpath: logpath,
                directory: path.dirname(logpath),
                suggestion: 'Verify the log path exists and is readable. For wildcard patterns, ensure the directory exists.',
                note: 'The log file or its parent directory must exist for fail2ban to monitor it.',
              },
            });
          }
        }
      }
    } catch (err) {
      // Unexpected error during validation
      console.error(`[JAIL CREATE] ❌ Logpath validation error: ${err.message}`);
      return res.status(400).json({
        success: false,
        error: `Failed to validate log path: ${logpath}`,
        details: {
          logpath: logpath,
          error: err.message,
          suggestion: 'Verify the log path exists and has correct permissions.',
        },
      });
    }
    
    // If we have a warning but path is valid, log it but continue
    if (logpathWarning) {
      console.log(`[JAIL CREATE] ⚠️ ${logpathWarning}`);
    }

    // Prepare config content
    const configContent = `[${name}]
enabled = true
filter = ${filter}
logpath = ${logpath}
maxretry = ${maxretry || 3}
findtime = ${findtime || 600}
bantime = ${bantime || 3600}
action = ${action || 'iptables-multiport'}
`;

    // Write config file using sudo
    // Create temp file first, then copy with sudo
    const tempFile = path.join(__dirname, `../tmp/${name}.conf.tmp`);
    const tempDir = path.dirname(tempFile);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    fs.writeFileSync(tempFile, configContent, 'utf8');

    try {
      // Copy temp file to final location with sudo
      await execFileAsync(SUDO_PATH, ['cp', tempFile, configFilePath], { timeout: 10000 });
      // Set correct permissions
      await execFileAsync(SUDO_PATH, ['chmod', '644', configFilePath], { timeout: 5000 });
      console.log(`[JAIL CREATE] ✅ Config file created: ${configFilePath}`);
    } catch (err) {
      // Clean up temp file
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
      throw new Error(`Failed to write config file: ${err.message}`);
    }

    // Clean up temp file
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }

    // Reload fail2ban to load new config
    try {
      console.log(`[JAIL CREATE] Reloading fail2ban...`);
      await execFileAsync(SUDO_PATH, [FAIL2BAN_CLIENT_PATH, 'reload'], { timeout: 10000 });
      console.log(`[JAIL CREATE] ✅ Fail2ban reloaded`);
    } catch (err) {
      console.error(`[JAIL CREATE] ⚠️ Failed to reload fail2ban: ${err.message}`);
      // Config file was created, but reload failed - still return success with warning
      return res.json({
        success: true,
        jail: name,
        message: `Jail configuration created, but fail2ban reload failed. Please reload manually: sudo ${FAIL2BAN_CLIENT_PATH} reload`,
        warning: err.message,
        configFile: configFilePath,
      });
    }

    // Optionally start the jail
    try {
      console.log(`[JAIL CREATE] Starting jail: ${name}`);
      await execFileAsync(SUDO_PATH, [FAIL2BAN_CLIENT_PATH, 'start', name], { timeout: 10000 });
      console.log(`[JAIL CREATE] ✅ Jail started: ${name}`);
    } catch (err) {
      console.warn(`[JAIL CREATE] ⚠️ Failed to start jail: ${err.message}`);
      // Jail was created and reloaded, but start failed - still return success with warning
      return res.json({
        success: true,
        jail: name,
        enabled: false,
        message: `Jail configuration created and reloaded, but failed to start. You can start it manually from the UI.`,
        warning: err.message,
        configFile: configFilePath,
      });
    }

    // Clear cache
    cache.clear('jails');

    res.setHeader('X-API-Version', API_VERSION);
    return res.json({
      success: true,
      jail: name,
      enabled: true,
      message: `Jail "${name}" created and started successfully`,
      configFile: configFilePath,
      warning: logpathWarning || undefined,
    });
  } catch (err) {
    console.error(`[JAIL CREATE] ❌ Error creating jail:`, err);
    next(err);
  }
});

module.exports = router;
