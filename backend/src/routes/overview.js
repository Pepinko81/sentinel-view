const express = require('express');
const router = express.Router();
const { executeScript } = require('../services/scriptExecutor');
const { parseMonitorOutput, defaultMonitorOutput } = require('../services/parsers/monitorParser');
const { detectFail2banError } = require('../services/parsers/parserUtils');
const { safeParse } = require('../services/parsers/parserUtils');
const { serializeOverviewResponse } = require('../services/serializers/apiSerializer');
const { inferCategory } = require('../utils/jailClassifier');
const { API_VERSION } = require('../config/api');
const cache = require('../services/cache');
const config = require('../config/config');
const os = require('os');

// Performance constants
const MAX_RESPONSE_TIME = 250; // ms - return cached if slower than this
const SCRIPT_TIMEOUT = 2000; // 2s max for script execution (reduced from 30s)
const CACHE_TTL = 10000; // 10 seconds (increased from 5s for better hit rate)
const ERROR_CACHE_TTL = 5000; // 5 seconds for error responses

/**
 * GET /api/overview
 * Returns summary + timestamp
 * Uses monitor-security.sh as the main data source
 * Handles fail2ban downtime gracefully with partial data
 * Optimized for <300ms response time
 */
router.get('/', async (req, res, next) => {
  const startTime = Date.now();
  
  try {
    const cacheKey = 'overview';
    
    // Fast path: return cached immediately (<10ms)
    const cached = cache.get(cacheKey);
    if (cached) {
      res.setHeader('X-API-Version', API_VERSION);
      return res.json(cached);
    }
    
    // Safe defaults for response
    const safeDefaults = {
      timestamp: new Date().toISOString(),
      server: {
        hostname: os.hostname(),
        uptime: formatUptime(process.uptime()),
      },
      summary: {
        active_jails: 0,
        total_banned_ips: 0,
      },
      jails: [],
      nginx: {
        '404_count': 0,
        admin_scans: 0,
        webdav_attacks: 0,
        hidden_files_attempts: 0,
      },
      system: {
        memory: 'N/A',
        disk: 'N/A',
        load: 'N/A',
      },
      errors: [],
      partial: false,
      serverStatus: 'online',
    };
    
    // Check for stale cache (even if expired, might be better than nothing)
    const staleCacheKey = `${cacheKey}:stale`;
    const staleCached = cache.get(staleCacheKey);
    
    // Execute script with aggressive timeout
    let monitorData = null;
    let scriptError = null;
    let usedStaleCache = false;
    
    try {
      // Create timeout promise
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Script execution timeout')), SCRIPT_TIMEOUT)
      );
      
      // Race between script execution and timeout
      const scriptPromise = executeScript('monitor-security.sh');
      
      let scriptResult;
      try {
        scriptResult = await Promise.race([scriptPromise, timeoutPromise]);
      } catch (timeoutErr) {
        // Script took too long - use stale cache if available
        if (staleCached) {
          console.warn(`Script timeout (${SCRIPT_TIMEOUT}ms), using stale cache`);
          usedStaleCache = true;
          const response = staleCached;
          cache.set(cacheKey, response, CACHE_TTL); // Re-cache stale data
          res.setHeader('X-API-Version', API_VERSION);
          return res.json(response);
        }
        
        // No stale cache - return safe defaults quickly
        const elapsed = Date.now() - startTime;
        if (elapsed > MAX_RESPONSE_TIME) {
          console.warn(`Response time exceeded ${MAX_RESPONSE_TIME}ms, returning defaults`);
          const errorResponse = serializeOverviewResponse({
            ...safeDefaults,
            errors: ['Script execution timeout - service may be slow'],
            partial: true,
            serverStatus: 'degraded',
          });
          
          // Cache error response with shorter TTL
          cache.set(cacheKey, errorResponse, ERROR_CACHE_TTL);
          res.setHeader('X-API-Version', API_VERSION);
          return res.json(errorResponse);
        }
        
        throw timeoutErr;
      }
      
      const { stdout, stderr } = scriptResult;
      
      // Check for fail2ban errors in stderr
      const errorCheck = detectFail2banError(stdout || '', stderr || '');
      
      // If fail2ban-client is not found, return safe defaults immediately (no parsing needed)
      if (errorCheck.isError && errorCheck.errorType === 'command_not_found') {
        console.warn('fail2ban-client not found, returning safe defaults');
        const errorResponse = serializeOverviewResponse({
          ...safeDefaults,
          errors: [errorCheck.message],
          partial: true,
          serverStatus: 'offline',
        });
        cache.set(cacheKey, errorResponse, ERROR_CACHE_TTL);
        res.setHeader('X-API-Version', API_VERSION);
        return res.json(errorResponse);
      }
      
      if (errorCheck.isError) {
        // fail2ban is down, but we can still parse nginx/system data
        console.warn('fail2ban error detected:', errorCheck.message);
        
        // Try to parse what we can (nginx/system might still work)
        monitorData = safeParse(parseMonitorOutput, stdout || '', defaultMonitorOutput);
        monitorData.errors = monitorData.errors || [];
        monitorData.errors.push(errorCheck.message);
        monitorData.partial = true;
      } else {
        // Normal parsing
        monitorData = safeParse(parseMonitorOutput, stdout || '', defaultMonitorOutput);
      }
    } catch (err) {
      console.error('Failed to execute monitor-security.sh:', err.message);
      scriptError = err.message;
      
      // Check elapsed time - if we're already past threshold, return quickly
      const elapsed = Date.now() - startTime;
      
      // Use stale cache if available and we're running slow
      if (staleCached && elapsed > MAX_RESPONSE_TIME) {
        console.warn('Using stale cache due to script failure and time constraint');
        usedStaleCache = true;
        const response = staleCached;
        cache.set(cacheKey, response, CACHE_TTL);
        res.setHeader('X-API-Version', API_VERSION);
        return res.json(response);
      }
      
      // Check if it's a fail2ban-client not found error
      const isFail2banNotFound = scriptError.includes('fail2ban-client') || 
                                  scriptError.includes('command not found');
      
      // Return safe defaults with error (serialized)
      const errorResponse = serializeOverviewResponse({
        ...safeDefaults,
        errors: [`Script execution failed: ${scriptError}`],
        partial: true,
        serverStatus: isFail2banNotFound ? 'offline' : 'error',
      });
      
      cache.set(cacheKey, errorResponse, ERROR_CACHE_TTL);
      res.setHeader('X-API-Version', API_VERSION);
      return res.json(errorResponse);
    }
    
    // Check if parsing had errors
    if (monitorData.errors && monitorData.errors.length > 0) {
      console.warn('Parser warnings:', monitorData.errors);
    }
    
    // Determine server status
    let serverStatus = 'online';
    if (monitorData.partial || (monitorData.errors && monitorData.errors.length > 0)) {
      // Check if fail2ban is the only issue
      const fail2banErrors = monitorData.errors.filter(e => 
        e.includes('fail2ban') || e.includes('connection') || e.includes('service')
      );
      if (fail2banErrors.length > 0 && 
          monitorData.nginx && 
          (monitorData.nginx.errors404 !== undefined || monitorData.nginx.totalRequests > 0)) {
        serverStatus = 'partial'; // nginx/system data available
      } else {
        serverStatus = 'offline';
      }
    }
    
    // Transform monitor data to frontend format using serializer
    const rawResponse = {
      timestamp: new Date().toISOString(),
      server: {
        hostname: monitorData.hostname || os.hostname(),
        uptime: monitorData.system?.uptime || formatUptime(process.uptime()),
      },
      summary: {
        active_jails: (monitorData.fail2ban?.jails || []).length,
        total_banned_ips: monitorData.fail2ban?.totalBanned || 0,
      },
      jails: (monitorData.jails || []).map(jail => ({
        name: jail.name,
        enabled: (jail.bannedIPs && jail.bannedIPs.length > 0) || false,
        bannedIPs: (jail.bannedIPs || []).map(ip => ({
          ip,
          bannedAt: new Date().toISOString(),
          banCount: 1,
        })),
        category: inferCategory(jail.name),
        filter: jail.name,
        maxRetry: null,
        banTime: null,
      })),
      nginx: {
        '404_count': monitorData.nginx?.errors404 || 0,
        admin_scans: monitorData.nginx?.adminScans || 0,
        webdav_attacks: monitorData.nginx?.webdavAttacks || 0,
        hidden_files_attempts: monitorData.nginx?.hiddenFilesAttacks || 0,
      },
      system: {
        memory: monitorData.system?.memory || 'N/A',
        disk: monitorData.system?.disk || 'N/A',
        load: monitorData.system?.load || 'N/A',
      },
      errors: monitorData.errors || [],
      partial: monitorData.partial || false,
      serverStatus,
    };
    
    // Serialize to ensure exact frontend schema match
    const response = serializeOverviewResponse(rawResponse);
    
    // Cache response (save as stale cache too for fallback)
    const ttl = response._partial ? ERROR_CACHE_TTL : CACHE_TTL;
    cache.set(cacheKey, response, ttl);
    cache.set(staleCacheKey, response, ttl * 2); // Keep stale cache longer
    
    // Check if we're still within response time target
    const elapsed = Date.now() - startTime;
    if (elapsed > MAX_RESPONSE_TIME && !usedStaleCache) {
      console.warn(`Overview endpoint took ${elapsed}ms (target: <${MAX_RESPONSE_TIME}ms)`);
    }
    
    res.setHeader('X-API-Version', API_VERSION);
    res.json(response);
  } catch (err) {
    next(err);
  }
});

function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (days > 0) {
    return `${days} day${days !== 1 ? 's' : ''}, ${hours}:${minutes.toString().padStart(2, '0')}`;
  }
  return `${hours}:${minutes.toString().padStart(2, '0')}`;
}

module.exports = router;
