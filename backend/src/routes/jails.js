const express = require('express');
const router = express.Router();
const f2b = require('../services/f2b');
const { discoverConfiguredJails, getJailRuntimeState } = require('../services/jailDiscovery');
const { inferCategory } = require('../utils/jailClassifier');
const { getFilterName, filterFileExists } = require('../services/filterManager');
const { serializeJail } = require('../services/serializers/apiSerializer');
const servers = require('../services/servers');

/**
 * GET /api/jails
 * Get all jails with their status (both enabled and disabled)
 * Query: ?server=id (optional - filter by server)
 */
router.get('/', async (req, res, next) => {
  try {
    const serverId = req.query.server;
    
    // If server specified, get jails from that server
    if (serverId && serverId !== 'local') {
      const server = servers.getServerById(serverId);
      if (!server) {
        return res.status(404).json({
          success: false,
          error: 'Server not found',
        });
      }
      
      // Convert server jails to expected format
      const jails = (server.jails || []).map(jail => {
        const category = inferCategory(jail.name);
        return serializeJail({
          name: jail.name,
          enabled: jail.enabled || false,
          category: category,
          failures_current: jail.bans || 0,
          failures_total: jail.bans || 0,
          bans_active: jail.bans || 0,
          bans_total: jail.bans || 0,
          last_ban: null,
          bannedIPs: [],
          filter: null,
        });
      });
      
      return res.json({
        success: true,
        jails,
        lastUpdated: new Date(server.lastSeen).toISOString(),
        serverStatus: server.online ? 'online' : 'offline',
        server: serverId,
      });
    }
    
    console.log('[JAILS API] GET /api/jails - Starting request');
    
    // Discover all configured jails from config files
    const discoveryResult = await discoverConfiguredJails();
    const allConfiguredJails = discoveryResult.jails || [];
    console.log(`[JAILS API] Discovered ${allConfiguredJails.length} configured jails:`, allConfiguredJails);
    
    // Get active jails from runtime status
    // Determine serverStatus based on whether we can get global status
    let serverStatus = 'online';
    let globalStatus = null;
    try {
      globalStatus = await f2b.getGlobalStatus();
      console.log(`[JAILS API] Fail2ban global status: ${globalStatus.jails.length} active jails`);
    } catch (err) {
      // If we can't get global status, fail2ban might be down
      console.warn(`[JAILS API] Failed to get global status: ${err.message}`);
      serverStatus = 'offline';
      globalStatus = { jails: [] };
    }
    const activeJailNames = new Set(globalStatus.jails || []);
    
    // Get detailed status for each configured jail
    const jails = await Promise.all(allConfiguredJails.map(async (jailName) => {
      const category = inferCategory(jailName);
      
      // Check if jail is in active list
      const isInActiveList = activeJailNames.has(jailName);
      
      // Check if filter exists for this jail
      let filterExists = false;
      let filterName = null;
      try {
        filterName = await getFilterName(jailName);
        if (filterName) {
          filterExists = filterFileExists(filterName);
        }
      } catch (err) {
        // If we can't determine filter, assume it doesn't exist
        console.warn(`[JAILS API] Could not check filter for ${jailName}: ${err.message}`);
      }
      
      // Jail is only truly enabled if it's in active list AND filter exists
      const isEnabled = isInActiveList && filterExists;
      
      // If jail is enabled and filter exists, get full status
      if (isEnabled) {
        try {
          const jailStatus = await f2b.getJailStatus(jailName);
          if (process.env.NODE_ENV === 'development') {
            console.log(`[JAILS API] ${jailName}: currentlyBanned=${jailStatus.currentlyBanned}, bannedIPs=${JSON.stringify(jailStatus.bannedIPs)}`);
          }
          const rawJail = {
            name: jailName,
            enabled: true,
            category: category,
            failures_current: jailStatus.currentlyBanned || 0,
            failures_total: jailStatus.totalBanned || 0,
            bans_active: jailStatus.currentlyBanned || 0,
            bans_total: jailStatus.totalBanned || 0,
            last_ban: jailStatus.lastBan || null,
            bannedIPs: jailStatus.bannedIPs || [],
            filter: jailStatus.filter || filterName || null,
            maxRetry: jailStatus.maxRetry || null,
            banTime: jailStatus.banTime || null,
          };
          const serialized = serializeJail(rawJail);
          if (process.env.NODE_ENV === 'development') {
            console.log(`[JAILS API] ${jailName}: serialized active_bans.count=${serialized.active_bans?.count}, active_bans.ips.length=${serialized.active_bans?.ips?.length || 0}`);
          }
          return serialized;
        } catch (err) {
          // If jail status fails, but filter exists, still mark as enabled
          const rawJail = {
            name: jailName,
            enabled: true,
            category: category,
            failures_current: 0,
            failures_total: 0,
            bans_active: 0,
            bans_total: 0,
            last_ban: null,
            bannedIPs: [],
            filter: filterName || null,
          };
          return serializeJail(rawJail);
        }
      } else {
        // Jail is disabled (either not in active list or filter missing)
        // If filter is missing, this is a configuration error
        const reason = isInActiveList && !filterExists 
          ? 'missing_filter' 
          : (!isInActiveList ? 'disabled' : 'unknown');
        
        const rawJail = {
          name: jailName,
          enabled: false,
          category: category,
          failures_current: 0,
          failures_total: 0,
          bans_active: 0,
          bans_total: 0,
          last_ban: null,
          bannedIPs: [],
          filter: filterName || null,
          _reason: reason, // Internal field to indicate why disabled
        };
        return serializeJail(rawJail);
      }
    }));
    
    console.log(`[JAILS API] Returning ${jails.length} jails, serverStatus: ${serverStatus}`);
    
    res.json({
      success: true,
      jails,
      lastUpdated: new Date().toISOString(),
      serverStatus: serverStatus,
      server: 'local',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/jails/:name
 * Get detailed status for a specific jail
 */
router.get('/:name', async (req, res, next) => {
  try {
    const jailName = req.params.name;
    const jailStatus = await f2b.getJailStatus(jailName);
    
    res.json({
      success: true,
      jail: {
        name: jailName,
        enabled: jailStatus.enabled || false,
        failures_current: jailStatus.currentlyBanned || 0,
        failures_total: jailStatus.totalBanned || 0,
        bans_active: jailStatus.currentlyBanned || 0,
        bans_total: jailStatus.totalBanned || 0,
        last_ban: jailStatus.lastBan || null,
        bannedIPs: jailStatus.bannedIPs || [],
        filter: jailStatus.filter,
        maxRetry: jailStatus.maxRetry,
        banTime: jailStatus.banTime,
        findTime: jailStatus.findTime,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/jails/:name/start
 * Start a jail
 */
router.post('/:name/start', async (req, res, next) => {
  try {
    const jailName = req.params.name;
    console.log(`[JAILS API] POST /api/jails/${jailName}/start - Starting jail`);
    const result = await f2b.startJail(jailName);
    console.log(`[JAILS API] Jail "${jailName}" start result:`, result.message);
    res.json(result);
  } catch (err) {
    console.error(`[JAILS API] Error starting jail "${req.params.name}": ${err.message}`);
    next(err);
  }
});

/**
 * POST /api/jails/:name/stop
 * Stop a jail
 */
router.post('/:name/stop', async (req, res, next) => {
  try {
    const jailName = req.params.name;
    const result = await f2b.stopJail(jailName);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/jails/:name/bans
 * Get banned IPs for a jail
 */
router.get('/:name/bans', async (req, res, next) => {
  try {
    const jailName = req.params.name;
    const jailStatus = await f2b.getJailStatus(jailName);
    
    res.json({
      success: true,
      jail: jailName,
      bannedIPs: jailStatus.bannedIPs || [],
      count: jailStatus.currentlyBanned || 0,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
