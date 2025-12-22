const express = require('express');
const router = express.Router();
const { executeScript } = require('../services/scriptExecutor');
const { parseMonitorOutput, defaultMonitorOutput } = require('../services/parsers/monitorParser');
const { parseSystemInfo, defaultSystemInfo } = require('../services/parsers/systemParser');
const { safeParse, detectFail2banError } = require('../services/parsers/parserUtils');
const { serializeSystemResponse } = require('../services/serializers/apiSerializer');
const { API_VERSION } = require('../config/api');
const cache = require('../services/cache');
const config = require('../config/config');
const os = require('os');

/**
 * GET /api/system
 * Returns memory, disk, uptime
 * Uses monitor-security.sh output
 * Works even if fail2ban is down (system info is independent)
 */
router.get('/', async (req, res, next) => {
  try {
    const cacheKey = 'system';
    const cached = cache.get(cacheKey);
    
    if (cached) {
      res.setHeader('X-API-Version', API_VERSION);
      return res.json(cached);
    }
    
    // Safe defaults
    const safeDefaults = {
      hostname: os.hostname(),
      uptime: formatUptime(process.uptime()),
      memory: 'N/A',
      disk: 'N/A',
      load: 'N/A',
      errors: [],
      partial: false,
    };
    
    let systemInfo = { ...safeDefaults };
    
    try {
      // Use monitor-security.sh which includes system info
      const { stdout, stderr } = await executeScript('monitor-security.sh');
      
      // Check for errors (system info should work even if fail2ban is down)
      const errorCheck = detectFail2banError(stdout, stderr);
      
      // Parse monitor output
      const monitorData = safeParse(parseMonitorOutput, stdout, defaultMonitorOutput);
      
      // Extract system info from monitor data
      if (monitorData.system) {
        systemInfo = {
          hostname: monitorData.hostname || monitorData.system.hostname || os.hostname(),
          uptime: monitorData.system.uptime || formatUptime(process.uptime()),
          memory: monitorData.system.memory || 'N/A',
          disk: monitorData.system.disk || 'N/A',
          load: monitorData.system.load || 'N/A',
          errors: monitorData.errors || [],
          partial: monitorData.partial || false,
        };
      } else {
        // Fallback: try parsing as standalone system info
        const systemData = safeParse(parseSystemInfo, stdout, defaultSystemInfo);
        systemInfo = {
          ...safeDefaults,
          ...systemData,
        };
      }
      
      // Add fail2ban error to errors array if present (but don't fail the request)
      if (errorCheck.isError && errorCheck.errorType !== 'empty_output') {
        systemInfo.errors = systemInfo.errors || [];
        if (!systemInfo.errors.some(e => e.includes('fail2ban'))) {
          systemInfo.errors.push(`fail2ban unavailable (system data still available): ${errorCheck.message}`);
        }
        systemInfo.partial = true;
      }
    } catch (err) {
      console.error('Failed to get system info:', err.message);
      // Use OS defaults
      systemInfo = {
        ...safeDefaults,
        uptime: formatUptime(process.uptime()),
        errors: [`Failed to retrieve system information: ${err.message}`],
        partial: true,
      };
    }
    
    // Serialize to ensure exact schema match
    const response = serializeSystemResponse(systemInfo);
    
    cache.set(cacheKey, response, config.cache.systemTTL);
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
