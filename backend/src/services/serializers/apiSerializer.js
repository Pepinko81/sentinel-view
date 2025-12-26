/**
 * API Response Serializer
 * Normalizes and serializes API responses to match frontend schema exactly
 * Ensures type safety, backward compatibility, and defensive handling
 */

/**
 * Serialize BannedIP to frontend format
 * @param {string|object} ip - IP address string or BannedIP object
 * @param {object} options - Additional options (bannedAt, banCount)
 * @returns {object} - Normalized BannedIP object
 */
function serializeBannedIP(ip, options = {}) {
  // Handle string IP
  if (typeof ip === 'string') {
    return {
      ip: String(ip || ''),
      bannedAt: options.bannedAt || new Date().toISOString(),
      banCount: typeof options.banCount === 'number' ? options.banCount : 1,
    };
  }
  
  // Handle BannedIP object
  if (ip && typeof ip === 'object') {
    return {
      ip: String(ip.ip || ''),
      bannedAt: ip.bannedAt || options.bannedAt || new Date().toISOString(),
      banCount: typeof ip.banCount === 'number' ? ip.banCount : (typeof options.banCount === 'number' ? options.banCount : 1),
    };
  }
  
  // Fallback
  return {
    ip: '',
    bannedAt: new Date().toISOString(),
    banCount: 1,
  };
}

/**
 * Serialize Jail to frontend format
 * Ensures all optional fields are present (even if null)
 * @param {object} jail - Jail data object
 * @returns {object} - Normalized Jail object matching frontend schema
 */
function serializeJail(jail) {
  const { inferCategory } = require('../../utils/jailClassifier');
  
  if (!jail || typeof jail !== 'object') {
    return {
      name: '',
      enabled: false,
      bannedIPs: [],
      banned_count: 0,
      banned_ips: [],
      category: null,
      filter: null,
      maxRetry: null,
      banTime: null,
    };
  }
  
  // Normalize bannedIPs array
  let bannedIPs = [];
  if (Array.isArray(jail.bannedIPs)) {
    bannedIPs = jail.bannedIPs.map(ip => serializeBannedIP(ip));
  } else if (Array.isArray(jail.bannedIPs)) {
    // Already array, but ensure it's normalized
    bannedIPs = jail.bannedIPs.map(ip => serializeBannedIP(ip));
  }

  // Derive banned counts with explicit semantics
  // currently_banned: runtime active bans (source of truth for UI)
  // If we have IPs but no count, use IP count as fallback
  const activeBannedIPsCount = Array.isArray(jail.bannedIPs) 
    ? jail.bannedIPs.length 
    : (Array.isArray(jail.banned_ips) ? jail.banned_ips.length : 0);
  
  const currentlyBanned =
    typeof jail.currently_banned === 'number' && jail.currently_banned > 0
      ? jail.currently_banned
      : (typeof jail.bans_active === 'number' && jail.bans_active > 0
          ? jail.bans_active
          : (typeof jail.banned_count === 'number' && jail.banned_count > 0
              ? jail.banned_count
              : (typeof jail.bannedCount === 'number' && jail.bannedCount > 0
                  ? jail.bannedCount
                  : (activeBannedIPsCount > 0 ? activeBannedIPsCount : 0))));

  // total_banned: historical total (optional, informational)
  const totalBanned =
    typeof jail.total_banned === 'number'
      ? jail.total_banned
      : (typeof jail.totalBanned === 'number' ? jail.totalBanned : undefined);

  const bannedIpsRaw = Array.isArray(jail.banned_ips)
    ? jail.banned_ips
    : (Array.isArray(jail.bannedIPs)
        ? jail.bannedIPs.map(ip => (typeof ip === 'string' ? ip : ip.ip))
        : []);
  
  // Extract IPs from bannedIPs array (could be strings or objects)
  const activeBannedIPs = Array.isArray(jail.bannedIPs)
    ? jail.bannedIPs.map(ip => (typeof ip === 'string' ? ip : ip.ip))
    : bannedIpsRaw;
  
  return {
    name: String(jail.name || ''),
    enabled: Boolean(jail.enabled),
    // Frontend expects active_bans and historical_bans structure
    active_bans: {
      count: currentlyBanned,
      ips: activeBannedIPs,
    },
    historical_bans: {
      total: totalBanned !== undefined ? totalBanned : null,
    },
    // Structured list used by frontend (backward compatibility)
    bannedIPs: bannedIPs,
    // API contract fields - explicit semantics (backward compatibility)
    currently_banned: currentlyBanned, // Runtime active bans (used in UI)
    banned_ips: bannedIpsRaw, // Active banned IP addresses
    total_banned: totalBanned, // Historical total (optional, informational)
    // Backward compatibility aliases
    banned_count: currentlyBanned, // Deprecated: use currently_banned
    // Optional fields - always include, use null if not available
    // Infer category from jail name if not provided
    category: jail.category || (jail.name ? inferCategory(jail.name) : null) || null,
    filter: jail.filter || jail.name || null,
    maxRetry: typeof jail.maxRetry === 'number' ? jail.maxRetry : null,
    banTime: typeof jail.banTime === 'number' ? jail.banTime : null,
  };
}

/**
 * Serialize JailsResponse to frontend format
 * @param {object} data - Raw response data
 * @returns {object} - Normalized JailsResponse matching frontend schema
 */
function serializeJailsResponse(data) {
  if (!data || typeof data !== 'object') {
    return {
      jails: [],
      lastUpdated: new Date().toISOString(),
      serverStatus: 'offline',
    };
  }
  
  // Normalize serverStatus to frontend enum
  let serverStatus = 'offline';
  if (data.serverStatus === 'online') {
    serverStatus = 'online';
  } else if (data.serverStatus === 'offline') {
    serverStatus = 'offline';
  } else if (data.serverStatus === 'partial' || data.serverStatus === 'error') {
    // Map partial/error to offline for frontend compatibility
    serverStatus = 'offline';
  }
  
  const response = {
    jails: Array.isArray(data.jails) 
      ? data.jails.map(serializeJail)
      : [],
    lastUpdated: data.lastUpdated || new Date().toISOString(),
    serverStatus: serverStatus,
  };
  
  // Add backend-only fields with _ prefix (ignored by frontend)
  if (data.errors && Array.isArray(data.errors) && data.errors.length > 0) {
    response._errors = data.errors;
  }
  if (data.partial !== undefined) {
    response._partial = Boolean(data.partial);
  }
  
  return response;
}

/**
 * Serialize Overview response
 * @param {object} data - Raw overview data
 * @returns {object} - Normalized overview response
 */
function serializeOverviewResponse(data) {
  if (!data || typeof data !== 'object') {
    return {
      timestamp: new Date().toISOString(),
      server: { hostname: '', uptime: '' },
      summary: { active_jails: 0, total_banned_ips: 0 },
      jails: [],
      nginx: { '404_count': 0, admin_scans: 0, webdav_attacks: 0, hidden_files_attempts: 0 },
      system: { memory: 'N/A', disk: 'N/A', load: 'N/A' },
    };
  }
  
  const response = {
    timestamp: data.timestamp || new Date().toISOString(),
    server: {
      hostname: String(data.server?.hostname || ''),
      uptime: String(data.server?.uptime || ''),
    },
    summary: {
      active_jails: typeof data.summary?.active_jails === 'number' ? data.summary.active_jails : 0,
      total_banned_ips: typeof data.summary?.total_banned_ips === 'number' ? data.summary.total_banned_ips : 0,
    },
    jails: Array.isArray(data.jails) 
      ? data.jails.map(serializeJail)
      : [],
      nginx: {
        '404_count': typeof data.nginx?.['404_count'] === 'number' ? data.nginx['404_count'] : 0,
        admin_scans: typeof data.nginx?.admin_scans === 'number' ? data.nginx.admin_scans : 0,
        webdav_attacks: typeof data.nginx?.webdav_attacks === 'number' ? data.nginx.webdav_attacks : 0,
        hidden_files_attempts: typeof data.nginx?.hidden_files_attempts === 'number' ? data.nginx.hidden_files_attempts : 0,
      },
    system: {
      memory: String(data.system?.memory || 'N/A'),
      disk: String(data.system?.disk || 'N/A'),
      load: String(data.system?.load || 'N/A'),
    },
  };
  
  // Add backend-only fields with _ prefix
  if (data.errors && Array.isArray(data.errors) && data.errors.length > 0) {
    response._errors = data.errors;
  }
  if (data.partial !== undefined) {
    response._partial = Boolean(data.partial);
  }
  if (data.serverStatus) {
    response._serverStatus = data.serverStatus;
  }
  
  return response;
}

/**
 * Serialize single Jail response (GET /api/jails/:name)
 * @param {object} data - Raw jail data
 * @returns {object} - Normalized jail response
 */
function serializeJailResponse(data) {
  if (!data || typeof data !== 'object') {
    return serializeJail({});
  }
  
  // Start with serialized jail
  const jail = serializeJail(data);
  
  // Add additional fields that might be in single jail response
  const response = { ...jail };
  
  // Add severity if present (not in frontend schema, but useful)
  if (data.severity) {
    response._severity = data.severity;
  }
  if (data.findTime !== undefined) {
    response._findTime = data.findTime;
  }
  if (data.last_activity) {
    response._lastActivity = data.last_activity;
  }
  
  // Add error info if present
  if (data.errors && Array.isArray(data.errors) && data.errors.length > 0) {
    response._errors = data.errors;
  }
  if (data.partial !== undefined) {
    response._partial = Boolean(data.partial);
  }
  
  return response;
}

/**
 * Serialize Nginx stats response
 * @param {object} data - Raw nginx data
 * @returns {object} - Normalized nginx response
 */
function serializeNginxResponse(data) {
  if (!data || typeof data !== 'object') {
    return {
      '404_count': 0,
      admin_scans: 0,
      webdav_attacks: 0,
      hidden_files_attempts: 0,
    };
  }
  
  const response = {
   '404_count': typeof data['404_count'] === 'number' ? data['404_count'] : 0,
   admin_scans: typeof data.admin_scans === 'number' ? data.admin_scans : 0,
   webdav_attacks: typeof data.webdav_attacks === 'number' ? data.webdav_attacks : 0,
   hidden_files_attempts: typeof data.hidden_files_attempts === 'number' ? data.hidden_files_attempts : 0,
  };
  
  // Add backend-only fields
  if (data.errors && Array.isArray(data.errors) && data.errors.length > 0) {
    response._errors = data.errors;
  }
  if (data.partial !== undefined) {
    response._partial = Boolean(data.partial);
  }
  
  return response;
}

/**
 * Serialize System info response
 * @param {object} data - Raw system data
 * @returns {object} - Normalized system response
 */
function serializeSystemResponse(data) {
  if (!data || typeof data !== 'object') {
    return {
      hostname: '',
      uptime: '',
      memory: 'N/A',
      disk: 'N/A',
      load: 'N/A',
    };
  }
  
  const response = {
    hostname: String(data.hostname || ''),
    uptime: String(data.uptime || ''),
    memory: String(data.memory || 'N/A'),
    disk: String(data.disk || 'N/A'),
    load: String(data.load || 'N/A'),
  };
  
  // Add backend-only fields
  if (data.errors && Array.isArray(data.errors) && data.errors.length > 0) {
    response._errors = data.errors;
  }
  if (data.partial !== undefined) {
    response._partial = Boolean(data.partial);
  }
  
  return response;
}

/**
 * Serialize Backup response
 * @param {object} data - Raw backup data
 * @returns {object} - Normalized backup response
 */
function serializeBackupResponse(data) {
  if (!data || typeof data !== 'object') {
    return {
      success: false,
      filename: 'unknown',
      path: 'unknown',
      size: 0,
      sizeFormatted: '0 B',
      timestamp: new Date().toISOString(),
    };
  }
  
  const response = {
    success: Boolean(data.success),
    filename: String(data.filename || 'unknown'),
    path: String(data.path || 'unknown'),
    size: typeof data.size === 'number' ? data.size : 0,
    sizeFormatted: String(data.sizeFormatted || '0 B'),
    timestamp: data.timestamp || new Date().toISOString(),
  };
  
  // Add backend-only fields
  if (data.errors && Array.isArray(data.errors) && data.errors.length > 0) {
    response._errors = data.errors;
  }
  if (data.partial !== undefined) {
    response._partial = Boolean(data.partial);
  }
  
  return response;
}

module.exports = {
  serializeBannedIP,
  serializeJail,
  serializeJailsResponse,
  serializeOverviewResponse,
  serializeJailResponse,
  serializeNginxResponse,
  serializeSystemResponse,
  serializeBackupResponse,
};

