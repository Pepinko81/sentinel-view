const express = require('express');
const router = express.Router();
const { executeScript } = require('../services/scriptExecutor');
const { parseMonitorOutput } = require('../services/parsers/monitorParser');
const { inferCategory, inferSeverity } = require('../utils/jailClassifier');
const cache = require('../services/cache');
const config = require('../config/config');
const os = require('os');

/**
 * GET /api/overview
 * Returns summary + timestamp
 * Uses monitor-security.sh as the main data source
 */
router.get('/', async (req, res, next) => {
  try {
    const cacheKey = 'overview';
    const cached = cache.get(cacheKey);
    
    if (cached) {
      return res.json(cached);
    }
    
    // Execute monitor-security.sh - this provides all data in one go
    let monitorData = null;
    try {
      const { stdout } = await executeScript('monitor-security.sh');
      monitorData = parseMonitorOutput(stdout);
    } catch (err) {
      console.error('Failed to execute monitor-security.sh:', err.message);
      // Return partial data with error indication
      return res.json({
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
        error: 'Failed to retrieve monitoring data',
      });
    }
    
    // Transform monitor data to frontend format
    const jails = monitorData.jails.map(jail => ({
      name: jail.name,
      enabled: jail.bannedIPs.length > 0,
      bannedIPs: jail.bannedIPs.map(ip => ({
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
        uptime: monitorData.system.uptime || formatUptime(process.uptime()),
      },
      summary: {
        active_jails: monitorData.fail2ban.jails.length,
        total_banned_ips: monitorData.fail2ban.totalBanned,
      },
      jails,
      nginx: {
        404_count: monitorData.nginx.errors404,
        admin_scans: monitorData.nginx.adminScans,
        webdav_attacks: monitorData.nginx.webdavAttacks,
        hidden_files_attempts: monitorData.nginx.hiddenFilesAttacks,
      },
      system: {
        memory: monitorData.system.memory || 'N/A',
        disk: monitorData.system.disk || 'N/A',
        load: monitorData.system.load || 'N/A',
      },
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
