const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const config = require('../config/config');

const execFileAsync = promisify(execFile);

// Absolute paths
const SUDO_PATH = process.env.SUDO_PATH || '/usr/bin/sudo';
const FAIL2BAN_CLIENT_PATH = process.env.FAIL2BAN_CLIENT_PATH || '/usr/bin/fail2ban-client';
const FAIL2BAN_REGEX_PATH = process.env.FAIL2BAN_REGEX_PATH || '/usr/bin/fail2ban-regex';
const SYSTEMCTL_PATH = process.env.SYSTEMCTL_PATH || '/usr/bin/systemctl';

// SQLite database (optional - only if better-sqlite3 is available)
let Database = null;
try {
  Database = require('better-sqlite3');
} catch (err) {
  // better-sqlite3 not available - will use fallback methods
  if (config.nodeEnv === 'development') {
    console.log('[FAIL2BAN ADAPTER] better-sqlite3 not available, using CLI fallback for ban data');
  }
}

// Import parsers
const { parseFail2banStatus, parseJailStatus } = require('./parsers/fail2banParser');
const { detectFail2banError } = require('./parsers/parserUtils');
const { getBanHistory, parseBanHistory } = require('./banHistoryParser');

/**
 * Get global fail2ban status
 * @returns {Promise<{status: string, jails: string[]}>}
 */
async function getGlobalStatus() {
  // Development mode: return mock data if fail2ban not available
  if (config.nodeEnv === 'development' && !config.fail2banAvailable) {
    return {
      status: 'ok',
      jails: ['nginx-hidden-files', 'nginx-admin-scanners', 'nginx-404'],
    };
  }

  const args = [FAIL2BAN_CLIENT_PATH, 'status'];
  const command = SUDO_PATH;

  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      timeout: config.scriptTimeout || 30000,
      maxBuffer: 5 * 1024 * 1024,
      encoding: 'utf8',
    });

    const errorCheck = detectFail2banError(stdout || '', stderr || '');
    if (errorCheck.isError) {
      throw new Error(errorCheck.message || 'fail2ban error');
    }

    const parsed = parseFail2banStatus(stdout);
    return {
      status: parsed.status || 'unknown',
      jails: parsed.jails || [],
    };
  } catch (err) {
    if (config.nodeEnv === 'development') {
      // Return mock data in development
      return {
        status: 'ok',
        jails: ['nginx-hidden-files', 'nginx-admin-scanners'],
      };
    }
    throw err;
  }
}

/**
 * Get jail status
 * @param {string} jail - Jail name
 * @returns {Promise<object>}
 */
async function getJailStatus(jail) {
  // Development mode: return mock data if fail2ban not available
  if (config.nodeEnv === 'development' && !config.fail2banAvailable) {
    return {
      name: jail,
      enabled: true,
      currentlyBanned: 2,
      totalBanned: 15,
      bannedIPs: ['194.180.49.167', '194.180.49.173'],
      filter: jail,
      maxRetry: 1,
      banTime: 259200,
      findTime: 3600,
    };
  }

  const args = [FAIL2BAN_CLIENT_PATH, 'status', jail];
  const command = SUDO_PATH;

  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      timeout: 10000,
      maxBuffer: 5 * 1024 * 1024,
      encoding: 'utf8',
    });

    const errorCheck = detectFail2banError(stdout || '', stderr || '');
    if (errorCheck.isError) {
      // Check if jail doesn't exist (disabled)
      const message = (errorCheck.message || '').toLowerCase();
      if (
        message.includes('does not exist') ||
        message.includes('no such jail') ||
        message.includes('jail not found') ||
        message.includes('error   nok') ||
        message.includes('error nok')
      ) {
        return {
          name: jail,
          enabled: false,
          currentlyBanned: 0,
          totalBanned: null,
          bannedIPs: [],
        };
      }
      throw new Error(errorCheck.message || 'fail2ban error');
    }

    const parsed = parseJailStatus(stdout, jail);
    return parsed;
  } catch (err) {
    if (config.nodeEnv === 'development') {
      // Return mock data in development
      return {
        name: jail,
        enabled: true,
        currentlyBanned: 0,
        totalBanned: 0,
        bannedIPs: [],
      };
    }
    throw err;
  }
}

/**
 * Get active bans from SQLite database
 * @returns {Promise<Array<{jail: string, ip: string, timeofban: number, bantime: number}>>}
 */
async function getActiveBans() {
  // Development mode: return mock data
  if (config.nodeEnv === 'development' && !config.fail2banAvailable) {
    return [
      { jail: 'nginx-hidden-files', ip: '194.180.49.167', timeofban: Date.now() / 1000 - 3600, bantime: 259200 },
      { jail: 'nginx-hidden-files', ip: '194.180.49.173', timeofban: Date.now() / 1000 - 7200, bantime: 259200 },
    ];
  }

  // Try to use SQLite if available
  if (Database && fs.existsSync(config.fail2ban.db)) {
    try {
      const db = new Database(config.fail2ban.db, { readonly: true });
      const currentTime = Math.floor(Date.now() / 1000);
      
      const rows = db.prepare(`
        SELECT jail, ip, timeofban, bantime 
        FROM bans 
        WHERE (timeofban + bantime) > ?
      `).all(currentTime);
      
      db.close();
      return rows;
    } catch (err) {
      // SQLite read failed - fallback to CLI
      if (config.nodeEnv === 'development') {
        console.warn(`[FAIL2BAN ADAPTER] SQLite read failed: ${err.message}, using CLI fallback`);
      }
    }
  }

  // Fallback: Get active bans from CLI (check each jail)
  try {
    const globalStatus = await getGlobalStatus();
    const activeBans = [];
    
    for (const jail of globalStatus.jails) {
      try {
        const jailStatus = await getJailStatus(jail);
        if (jailStatus.bannedIPs && jailStatus.bannedIPs.length > 0) {
          for (const ip of jailStatus.bannedIPs) {
            activeBans.push({
              jail: jail,
              ip: ip,
              timeofban: Math.floor(Date.now() / 1000) - 3600, // Approximate
              bantime: jailStatus.banTime || 3600,
            });
          }
        }
      } catch (err) {
        // Skip this jail if status check fails
        continue;
      }
    }
    
    return activeBans;
  } catch (err) {
    // CLI fallback also failed
    return [];
  }
}

/**
 * Get ban history from log file
 * @param {string|null} jail - Optional jail filter
 * @param {number} limit - Max entries to return
 * @returns {Promise<Array>}
 */
async function getBanHistoryFromLog(jail = null, limit = 50) {
  // Development mode: return mock data
  if (config.nodeEnv === 'development' && !config.fail2banAvailable) {
    return [
      {
        jail: 'nginx-hidden-files',
        ip: '194.180.49.167',
        action: 'ban',
        timestamp: new Date().toISOString(),
      },
      {
        jail: 'nginx-hidden-files',
        ip: '194.180.49.173',
        action: 'ban',
        timestamp: new Date(Date.now() - 3600000).toISOString(),
      },
    ];
  }

  try {
    return await getBanHistory(jail, limit);
  } catch (err) {
    if (config.nodeEnv === 'development') {
      // Return empty array in development if log file not accessible
      return [];
    }
    throw err;
  }
}

/**
 * Create filter file
 * @param {string} name - Filter name
 * @param {string} failregex - Fail regex pattern
 * @param {string|null} ignoreregex - Optional ignore regex pattern
 * @returns {Promise<{success: boolean, message: string, path: string}>}
 */
async function createFilter(name, failregex, ignoreregex = null) {
  // Development mode: write to temp directory
  const filterDir = config.nodeEnv === 'development' && !config.fail2banAvailable
    ? path.join(__dirname, '../tmp/filters')
    : config.fail2ban.filterDir;

  // Ensure filter directory exists
  if (!fs.existsSync(filterDir)) {
    if (config.nodeEnv === 'development') {
      fs.mkdirSync(filterDir, { recursive: true });
    } else {
      throw new Error(`Filter directory does not exist: ${filterDir}`);
    }
  }

  const filterPath = path.join(filterDir, `${name}.conf`);

  // Validate filter name
  if (!/^[a-zA-Z0-9-]+$/.test(name)) {
    throw new Error('Invalid filter name: must contain only letters, numbers, and dashes');
  }

  // Validate regex using fail2ban-regex (if available)
  if (config.nodeEnv === 'production' && config.fail2banAvailable) {
    try {
      // Create temp filter file for validation
      const tempFilterPath = path.join(__dirname, '../tmp', `${name}.conf.tmp`);
      const tempDir = path.dirname(tempFilterPath);
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      let tempFilterContent = `[Definition]\nfailregex = ${failregex}\n`;
      if (ignoreregex) {
        tempFilterContent += `ignoreregex = ${ignoreregex}\n`;
      }
      fs.writeFileSync(tempFilterPath, tempFilterContent, 'utf8');

      // Test with a sample log line (if log file exists)
      if (fs.existsSync(config.nginxAccessLog)) {
        const { stdout, stderr } = await execFileAsync(
          SUDO_PATH,
          [FAIL2BAN_REGEX_PATH, config.nginxAccessLog, tempFilterPath],
          {
            timeout: 10000,
            maxBuffer: 1024 * 1024,
            encoding: 'utf8',
          }
        );

        // Check for errors in output
        if (stderr && stderr.includes('error')) {
          fs.unlinkSync(tempFilterPath);
          throw new Error(`Regex validation failed: ${stderr}`);
        }
      }

      // Clean up temp file
      if (fs.existsSync(tempFilterPath)) {
        fs.unlinkSync(tempFilterPath);
      }
    } catch (err) {
      if (err.code !== 'ENOENT' && !err.message.includes('validation failed')) {
        // Ignore ENOENT (fail2ban-regex not found) but throw validation errors
        throw err;
      }
    }
  }

  // Build filter content
  let filterContent = `[Definition]\n`;
  filterContent += `failregex = ${failregex}\n`;
  if (ignoreregex && ignoreregex.trim()) {
    filterContent += `ignoreregex = ${ignoreregex.trim()}\n`;
  }

  // Write filter file
  if (config.nodeEnv === 'development' && !config.fail2banAvailable) {
    // Development: write directly
    fs.writeFileSync(filterPath, filterContent, 'utf8');
  } else {
    // Production: use helper script or sudo
    const tempFile = path.join(__dirname, '../tmp', `${name}.conf.tmp`);
    const tempDir = path.dirname(tempFile);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    fs.writeFileSync(tempFile, filterContent, 'utf8');

    // Use helper script if available, otherwise use sudo cp
    const scriptPath = path.resolve(__dirname, '../../scripts/create-filter-file.sh');
    if (fs.existsSync(scriptPath)) {
      await execFileAsync(SUDO_PATH, [scriptPath, name, tempFile], {
        timeout: 10000,
        maxBuffer: 1024 * 1024,
        encoding: 'utf8',
      });
    } else {
      // Fallback: use sudo cp
      await execFileAsync(SUDO_PATH, ['cp', tempFile, filterPath], {
        timeout: 10000,
      });
      await execFileAsync(SUDO_PATH, ['chmod', '644', filterPath], {
        timeout: 5000,
      });
    }

    // Clean up temp file
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  }

  return {
    success: true,
    message: `Filter "${name}" created successfully`,
    path: filterPath,
  };
}

/**
 * Restart fail2ban service
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function restartFail2ban() {
  // Development mode: mock success
  if (config.nodeEnv === 'development' && !config.fail2banAvailable) {
    return {
      success: true,
      message: 'Fail2ban service restarted (mock)',
    };
  }

  const args = [SYSTEMCTL_PATH, 'restart', 'fail2ban'];
  const command = SUDO_PATH;

  try {
    await execFileAsync(command, args, {
      timeout: config.scriptTimeout || 30000,
      maxBuffer: 1024 * 1024,
      encoding: 'utf8',
    });

    // Wait for service to stabilize
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Verify service is running
    const statusArgs = [SYSTEMCTL_PATH, 'is-active', 'fail2ban'];
    const { stdout: statusStdout } = await execFileAsync(SUDO_PATH, statusArgs, {
      timeout: 10000,
      maxBuffer: 1024,
      encoding: 'utf8',
    });

    const isActive = statusStdout.trim() === 'active';
    if (!isActive) {
      throw new Error(`Service restart completed but status is not 'active': ${statusStdout.trim()}`);
    }

    return {
      success: true,
      message: 'Fail2ban service restarted successfully',
    };
  } catch (err) {
    throw new Error(`Failed to restart fail2ban: ${err.message}`);
  }
}

/**
 * Unban IP address
 * @param {string} jail - Jail name
 * @param {string} ip - IP address to unban
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function unbanIP(jail, ip) {
  // Development mode: mock success
  if (config.nodeEnv === 'development' && !config.fail2banAvailable) {
    return {
      success: true,
      message: `IP ${ip} unbanned from ${jail} (mock)`,
    };
  }

  // Validate IP format (basic)
  if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip)) {
    throw new Error(`Invalid IP address format: ${ip}`);
  }

  const args = [FAIL2BAN_CLIENT_PATH, 'set', jail, 'unbanip', ip];
  const command = SUDO_PATH;

  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      timeout: 10000,
      maxBuffer: 1024 * 1024,
      encoding: 'utf8',
    });

    const errorCheck = detectFail2banError(stdout || '', stderr || '');
    if (errorCheck.isError) {
      throw new Error(errorCheck.message || 'fail2ban error');
    }

    return {
      success: true,
      message: `IP ${ip} unbanned from ${jail} successfully`,
    };
  } catch (err) {
    throw new Error(`Failed to unban IP: ${err.message}`);
  }
}

module.exports = {
  getGlobalStatus,
  getJailStatus,
  getActiveBans,
  getBanHistoryFromLog,
  createFilter,
  restartFail2ban,
  unbanIP,
};

