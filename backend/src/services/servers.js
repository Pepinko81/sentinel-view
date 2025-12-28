const path = require('path');
const fs = require('fs');
let Database = null;

try {
  Database = require('better-sqlite3');
} catch (err) {
  console.warn('[SERVERS] better-sqlite3 not available, using in-memory storage');
}

// Database path
const DB_DIR = path.join(__dirname, '../../data');
const DB_PATH = path.join(DB_DIR, 'servers.db');

// Ensure data directory exists
if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

/**
 * Initialize servers database
 */
function initDatabase() {
  if (!Database) {
    console.warn('[SERVERS] Database not available, using in-memory storage');
    return;
  }

  try {
    const db = new Database(DB_PATH);
    
    // Create servers table
    db.exec(`
      CREATE TABLE IF NOT EXISTS servers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        ip TEXT,
        lastSeen INTEGER NOT NULL,
        createdAt INTEGER NOT NULL,
        secret TEXT NOT NULL,
        remoteUrl TEXT
      );
      
      CREATE TABLE IF NOT EXISTS server_data (
        serverId TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        jails TEXT,
        bans TEXT,
        logTail TEXT,
        FOREIGN KEY (serverId) REFERENCES servers(id) ON DELETE CASCADE,
        PRIMARY KEY (serverId, timestamp)
      );
      
      CREATE INDEX IF NOT EXISTS idx_server_data_serverId ON server_data(serverId);
      CREATE INDEX IF NOT EXISTS idx_server_data_timestamp ON server_data(timestamp);
    `);
    
    db.close();
    console.log('[SERVERS] Database initialized');
  } catch (err) {
    console.error('[SERVERS] Database initialization failed:', err);
    throw err;
  }
}

/**
 * Register or update server
 * @param {string} serverId - Server UUID
 * @param {string} secret - Secret key
 * @param {string} name - Server name (optional)
 * @param {string} ip - Server IP (optional)
 * @returns {object} Server record
 */
function registerServer(serverId, secret, name = null, ip = null, remoteUrl = null) {
  if (!Database) {
    // In-memory fallback
    const now = Date.now();
    return {
      id: serverId,
      name: name || `Server ${serverId.substring(0, 8)}`,
      ip: ip || null,
      lastSeen: now,
      createdAt: now,
      remoteUrl: remoteUrl || null,
    };
  }

  const db = new Database(DB_PATH);
  
  try {
    const now = Date.now();
    
    // Check if server exists
    const existing = db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId);
    
    // Auto-detect remoteUrl from IP if not provided
    let finalRemoteUrl = remoteUrl;
    if (!finalRemoteUrl && ip && ip !== 'unknown') {
      // Try to construct URL from IP (default port 4040)
      finalRemoteUrl = `http://${ip}:4040`;
    }
    
    if (existing) {
      // Update lastSeen (only if secret matches - verified separately)
      db.prepare(`
        UPDATE servers 
        SET lastSeen = ?, name = COALESCE(?, name), ip = COALESCE(?, ip), remoteUrl = COALESCE(?, remoteUrl)
        WHERE id = ?
      `).run(now, name, ip, finalRemoteUrl, serverId);
    } else {
      // Insert new server
      db.prepare(`
        INSERT INTO servers (id, name, ip, lastSeen, createdAt, secret, remoteUrl)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        serverId,
        name || `Server ${serverId.substring(0, 8)}`,
        ip || null,
        now,
        now,
        secret,
        finalRemoteUrl
      );
    }
    
    const server = db.prepare('SELECT id, name, ip, lastSeen, createdAt, remoteUrl FROM servers WHERE id = ?').get(serverId);
    db.close();
    
    return {
      id: server.id,
      name: server.name,
      ip: server.ip,
      lastSeen: server.lastSeen,
      createdAt: server.createdAt,
      remoteUrl: server.remoteUrl,
    };
  } catch (err) {
    db.close();
    console.error('[SERVERS] Error registering server:', err);
    throw err;
  }
}

/**
 * Verify server secret
 * @param {string} serverId - Server UUID
 * @param {string} secret - Secret key
 * @returns {boolean} True if valid
 */
function verifyServerSecret(serverId, secret) {
  if (!Database) {
    return true; // Allow in fallback mode
  }

  try {
    const db = new Database(DB_PATH);
    const server = db.prepare('SELECT secret FROM servers WHERE id = ?').get(serverId);
    db.close();
    
    if (!server) {
      return false;
    }
    
    return server.secret === secret;
  } catch (err) {
    console.error('[SERVERS] Error verifying secret:', err);
    return false;
  }
}

/**
 * Store server data
 * @param {string} serverId - Server UUID
 * @param {object} data - Server data (jails, bans, logTail)
 */
function storeServerData(serverId, data) {
  if (!Database) {
    return; // Skip in fallback mode
  }

  try {
    const db = new Database(DB_PATH);
    const timestamp = Date.now();
    
    db.prepare(`
      INSERT OR REPLACE INTO server_data (serverId, timestamp, jails, bans, logTail)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      serverId,
      timestamp,
      JSON.stringify(data.jails || []),
      JSON.stringify(data.bans || []),
      JSON.stringify(data.logTail || [])
    );
    
    // Keep only last 100 records per server
    db.prepare(`
      DELETE FROM server_data
      WHERE serverId = ? AND timestamp NOT IN (
        SELECT timestamp FROM server_data
        WHERE serverId = ?
        ORDER BY timestamp DESC
        LIMIT 100
      )
    `).run(serverId, serverId);
    
    db.close();
  } catch (err) {
    console.error('[SERVERS] Error storing server data:', err);
  }
}

/**
 * Get all servers
 * @returns {Array} List of servers
 */
function getAllServers() {
  if (!Database) {
    return [];
  }

  try {
    const db = new Database(DB_PATH);
    
    // Get servers with latest data
    const servers = db.prepare(`
      SELECT 
        s.id,
        s.name,
        s.ip,
        s.lastSeen,
        s.createdAt,
        (SELECT COUNT(*) FROM server_data sd WHERE sd.serverId = s.id) as dataCount
      FROM servers s
      ORDER BY s.lastSeen DESC
    `).all();
    
    // Calculate bans count from latest data
    const serversWithBans = servers.map(server => {
      const latestData = db.prepare(`
        SELECT bans FROM server_data
        WHERE serverId = ?
        ORDER BY timestamp DESC
        LIMIT 1
      `).get(server.id);
      
      let bansCount = 0;
      if (latestData && latestData.bans) {
        try {
          const bans = JSON.parse(latestData.bans);
          bansCount = Array.isArray(bans) ? bans.length : 0;
        } catch (err) {
          // Ignore parse errors
        }
      }
      
      return {
        id: server.id,
        name: server.name,
        ip: server.ip,
        lastSeen: server.lastSeen,
        createdAt: server.createdAt,
        bans: bansCount,
        online: (Date.now() - server.lastSeen) < 60000, // Online if seen in last 60 seconds
        lastSeenAt: server.lastSeen,
      };
    });
    
    db.close();
    return serversWithBans;
  } catch (err) {
    console.error('[SERVERS] Error getting servers:', err);
    return [];
  }
}

/**
 * Get server secret
 * @param {string} serverId - Server UUID
 * @returns {string|null} Secret key
 */
function getServerSecret(serverId) {
  if (!Database) {
    return null;
  }

  try {
    const db = new Database(DB_PATH);
    const server = db.prepare('SELECT secret FROM servers WHERE id = ?').get(serverId);
    db.close();
    return server ? server.secret : null;
  } catch (err) {
    console.error('[SERVERS] Error getting server secret:', err);
    return null;
  }
}

/**
 * Get server by ID
 * @param {string} serverId - Server UUID
 * @returns {object|null} Server details
 */
function getServerById(serverId) {
  if (!Database) {
    return null;
  }

  try {
    const db = new Database(DB_PATH);
    
    const server = db.prepare('SELECT id, name, ip, lastSeen, createdAt, remoteUrl FROM servers WHERE id = ?').get(serverId);
    
    if (!server) {
      db.close();
      return null;
    }
    
    // Get latest data
    const latestData = db.prepare(`
      SELECT jails, bans, logTail, timestamp
      FROM server_data
      WHERE serverId = ?
      ORDER BY timestamp DESC
      LIMIT 1
    `).get(serverId);
    
    db.close();
    
    let jails = [];
    let bans = [];
    let logTail = [];
    
    if (latestData) {
      try {
        jails = JSON.parse(latestData.jails || '[]');
        bans = JSON.parse(latestData.bans || '[]');
        logTail = JSON.parse(latestData.logTail || '[]');
      } catch (err) {
        console.warn('[SERVERS] Error parsing server data:', err);
      }
    }
    
    return {
      id: server.id,
      name: server.name,
      ip: server.ip,
      lastSeen: server.lastSeen,
      createdAt: server.createdAt,
      remoteUrl: server.remoteUrl,
      online: (Date.now() - server.lastSeen) < 60000, // Online if seen in last 60 seconds
      lastSeenAt: server.lastSeen,
      jails: jails,
      bans: bans,
      logTail: logTail,
    };
  } catch (err) {
    console.error('[SERVERS] Error getting server:', err);
    return null;
  }
}

/**
 * Get server jails
 * @param {string} serverId - Server UUID
 * @returns {Array} Jails list
 */
function getServerJails(serverId) {
  const server = getServerById(serverId);
  return server ? server.jails : [];
}

/**
 * Get server bans
 * @param {string} serverId - Server UUID
 * @returns {Array} Bans list
 */
function getServerBans(serverId) {
  const server = getServerById(serverId);
  return server ? server.bans : [];
}

// Initialize database on module load
if (Database) {
  initDatabase();
}

module.exports = {
  registerServer,
  verifyServerSecret,
  storeServerData,
  getAllServers,
  getServerById,
  getServerJails,
  getServerBans,
  getServerSecret,
};

