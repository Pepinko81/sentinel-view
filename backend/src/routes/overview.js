const express = require('express');
const router = express.Router();
const { executeScript } = require('../services/scriptExecutor');
const { parseMonitorOutput, defaultMonitorOutput } = require('../services/parsers/monitorParser');
const { detectFail2banError } = require('../services/parsers/parserUtils');
const { safeParse } = require('../services/parsers/parserUtils');
const { inferCategory, inferSeverity } = require('../utils/jailClassifier');
const cache = require('../services/cache');
const config = require('../config/config');
const os = require('os');

/**
 * GET /api/overview
 * Returns summary + timestamp
 * Uses monitor-security.sh as the main data source
 * Handles fail2ban downtime gracefully with partial data
 */
router.get('/', async (req, res, next) => {
  try {
    const cacheKey = 'overview';
    const cached = cache.get(cacheKey);
    
    if (cached) {
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
        404_count: 0,
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
    
    // Execute monitor-security.sh - this provides all data in one go
    let monitorData = null;
    let scriptError = null;
    
    try {
      const { stdout, stderr } = await executeScript('monitor-security.sh');
      
      // Check for fail2ban errors in stderr
      const errorCheck = detectFail2banError(stdout, stderr);
      if (errorCheck.isError) {
        // fail2ban is down, but we can still parse nginx/system data
        console.warn('fail2ban error detected:', errorCheck.message);
        
        // Try to parse what we can (nginx/system might still work)
        monitorData = safeParse(parseMonitorOutput, stdout, defaultMonitorOutput);
        monitorData.errors = monitorData.errors || [];
        monitorData.errors.push(errorCheck.message);
        monitorData.partial = true;
      } else {
        // Normal parsing
        monitorData = safeParse(parseMonitorOutput, stdout, defaultMonitorOutput);
      }
    } catch (err) {
      console.error('Failed to execute monitor-security.sh:', err.message);
      scriptError = err.message;
      
      // Return safe defaults with error
      const errorResponse = {
        ...safeDefaults,
        errors: [`Script execution failed: ${scriptError}`],
        partial: true,
        serverStatus: 'error',
      };
      
      cache.set(cacheKey, errorResponse, config.cache.overviewTTL);
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
    
    // Transform monitor data to frontend format
    const jails = (monitorData.jails || []).map(jail => ({
      name: jail.name,
      enabled: (jail.bannedIPs && jail.bannedIPs.length > 0) || false,
      bannedIPs: (jail.bannedIPs || []).map(ip => ({
        ip,
        bannedAt: new Date().toISOString(), // fail2ban doesn't provide timestamps
        banCount: 1,
      })),
      category: inferCategory(jail.name),
      filter: jail.name,
      maxRetry: null,
      banTime: null,
    }));
    
    const response = {
      timestamp: new Date().toISOString(),
      server: {
        hostname: monitorData.hostname || os.hostname(),
        uptime: monitorData.system?.uptime || formatUptime(process.uptime()),
      },
      summary: {
        active_jails: (monitorData.fail2ban?.jails || []).length,
        total_banned_ips: monitorData.fail2ban?.totalBanned || 0,
      },
      jails,
      nginx: {
        404_count: monitorData.nginx?.errors404 || 0,
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
    
    cache.set(cacheKey, response, config.cache.overviewTTL);
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
