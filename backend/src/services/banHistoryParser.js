const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');

const execFileAsync = promisify(execFile);

// Absolute paths
const SUDO_PATH = process.env.SUDO_PATH || '/usr/bin/sudo';
const FAIL2BAN_LOG_PATH = '/var/log/fail2ban.log';

/**
 * Parse fail2ban log file to extract ban/unban events
 * @param {string} logContent - Content of the log file
 * @param {string|null} jailFilter - Optional jail name to filter by
 * @param {number} limit - Maximum number of events to return
 * @returns {Array} Array of normalized event objects
 */
function parseBanHistory(logContent, jailFilter = null, limit = 50) {
  const lines = logContent.split('\n').filter(line => line.trim());
  const events = [];

  // Patterns to match:
  // 2024-01-01 12:00:00,123 fail2ban.actions: [jail-name] Ban 192.168.1.1
  // 2024-01-01 12:00:00,123 fail2ban.actions: [jail-name] Unban 192.168.1.1
  // 2024-01-01 12:00:00,123 fail2ban.actions: [jail-name] Restore Ban 192.168.1.1
  
  const actionPattern = /fail2ban\.actions:\s+\[([^\]]+)\]\s+(Ban|Unban|Restore Ban)\s+(\d+\.\d+\.\d+\.\d+)/i;
  const timestampPattern = /^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2}),(\d{3})/;

  for (const line of lines) {
    // Extract timestamp
    const timestampMatch = line.match(timestampPattern);
    if (!timestampMatch) continue;

    const [, date, time, milliseconds] = timestampMatch;
    const timestampStr = `${date}T${time}.${milliseconds}Z`;
    let timestamp;
    try {
      timestamp = new Date(timestampStr).toISOString();
    } catch (err) {
      console.warn(`[BAN HISTORY PARSER] Failed to parse timestamp: ${timestampStr}`);
      continue;
    }

    // Extract action (ban/unban/restore)
    const actionMatch = line.match(actionPattern);
    if (!actionMatch) continue;

    const [, jailName, action, ip] = actionMatch;

    // Normalize action
    let normalizedAction = action.toLowerCase();
    if (normalizedAction === 'restore ban') {
      normalizedAction = 'restore';
    }

    // Filter by jail if specified
    if (jailFilter && jailName !== jailFilter) {
      continue;
    }

    events.push({
      jail: jailName,
      ip: ip,
      action: normalizedAction,
      timestamp: timestamp,
    });
  }

  // Sort by timestamp (newest first) and limit
  events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  return events.slice(0, limit);
}

/**
 * Read fail2ban log file and parse ban history
 * @param {string|null} jailFilter - Optional jail name to filter by
 * @param {number} limit - Maximum number of events to return
 * @returns {Promise<Array>} Array of normalized event objects
 */
async function getBanHistory(jailFilter = null, limit = 50) {
  // Check if log file exists
  if (!fs.existsSync(FAIL2BAN_LOG_PATH)) {
    throw new Error(`Fail2ban log file not found: ${FAIL2BAN_LOG_PATH}`);
  }

  try {
    // Read log file using helper script to get last N lines (limit * 2 to account for filtering)
    // Use sudo to read the log file
    const scriptPath = path.resolve(__dirname, '../scripts/read-fail2ban-log.sh');
    const { stdout, stderr } = await execFileAsync(
      SUDO_PATH,
      [scriptPath, String(limit * 2)],
      {
        timeout: 10000,
        maxBuffer: 5 * 1024 * 1024,
        encoding: 'utf8',
      }
    );

    if (stderr && !stdout) {
      throw new Error(`Failed to read fail2ban log: ${stderr}`);
    }

    // Parse the log content
    const events = parseBanHistory(stdout || '', jailFilter, limit);

    return events;
  } catch (err) {
    // Check if it's a permission error
    if (err.code === 'ENOENT' || err.message.includes('not found')) {
      throw new Error(`Fail2ban log file not found or not accessible: ${FAIL2BAN_LOG_PATH}`);
    }
    if (err.code === 'EACCES' || err.message.includes('Permission denied')) {
      throw new Error(`Permission denied: Cannot read ${FAIL2BAN_LOG_PATH}. Check sudo permissions.`);
    }
    throw new Error(`Failed to read fail2ban log: ${err.message}`);
  }
}

module.exports = {
  getBanHistory,
  parseBanHistory,
};

