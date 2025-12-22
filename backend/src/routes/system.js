const express = require('express');
const router = express.Router();
const { executeScript } = require('../services/scriptExecutor');
const { parseMonitorOutput } = require('../services/parsers/monitorParser');
const cache = require('../services/cache');
const config = require('../config/config');
const os = require('os');

/**
 * GET /api/system
 * Returns memory, disk, uptime
 * Uses monitor-security.sh output
 */
router.get('/', async (req, res, next) => {
  try {
    const cacheKey = 'system';
    const cached = cache.get(cacheKey);
    
    if (cached) {
      return res.json(cached);
    }
    
    let systemInfo = {
      hostname: os.hostname(),
      uptime: formatUptime(process.uptime()),
      memory: null,
      disk: null,
      load: null,
    };
    
    try {
      // Use monitor-security.sh which includes system info
      const { stdout } = await executeScript('monitor-security.sh');
      const monitorData = parseMonitorOutput(stdout);
      
      systemInfo = {
        hostname: monitorData.hostname || os.hostname(),
        uptime: monitorData.system.uptime || formatUptime(process.uptime()),
        memory: monitorData.system.memory || 'N/A',
        disk: monitorData.system.disk || 'N/A',
        load: monitorData.system.load || 'N/A',
      };
    } catch (err) {
      console.error('Failed to get system info:', err.message);
      // Use OS defaults
      systemInfo.uptime = formatUptime(process.uptime());
    }
    
    cache.set(cacheKey, systemInfo, config.cache.systemTTL);
    res.json(systemInfo);
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
