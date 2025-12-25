const express = require('express');
const router = express.Router();
const f2b = require('../services/f2b');
const { discoverConfiguredJails, getJailRuntimeState } = require('../services/jailDiscovery');
const { inferCategory } = require('../utils/jailClassifier');
const { getFilterName, filterFileExists } = require('../services/filterManager');

/**
 * GET /api/jails
 * Get all jails with their status (both enabled and disabled)
 */
router.get('/', async (req, res, next) => {
  try {
    // Discover all configured jails from config files
    const discoveryResult = await discoverConfiguredJails();
    const allConfiguredJails = discoveryResult.jails || [];
    
    // Get active jails from runtime status
    const globalStatus = await f2b.getGlobalStatus();
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
          return {
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
        } catch (err) {
          // If jail status fails, but filter exists, still mark as enabled
          return {
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
        }
      } else {
        // Jail is disabled (either not in active list or filter missing)
        // If filter is missing, this is a configuration error
        const reason = isInActiveList && !filterExists 
          ? 'missing_filter' 
          : (!isInActiveList ? 'disabled' : 'unknown');
        
        return {
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
      }
    }));
    
    res.json({
      success: true,
      jails,
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
    const result = await f2b.startJail(jailName);
    res.json(result);
  } catch (err) {
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
