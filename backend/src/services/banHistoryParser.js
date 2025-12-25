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

  // Patterns to match various fail2ban log formats:
  // Format 1: 2024-01-01 12:00:00,123 fail2ban.actions: [jail-name] Ban 192.168.1.1
  // Format 2: 2024-01-01 12:00:00,123 fail2ban.actions [1234]: NOTICE [jail-name] Ban 192.168.1.1
  // Format 3: 2024-01-01 12:00:00,123 fail2ban.actions [1234]: WARNING [jail-name] Unban 192.168.1.1
  // Format 4: 2024-01-01 12:00:00,123 fail2ban.action: [jail-name] Ban 192.168.1.1
  
  // More flexible action pattern - handles various formats including NOTICE/WARNING prefixes
  // Matches: fail2ban.actions [pid]: NOTICE/WARNING [jail] Ban/Unban/Restore Ban IP
  // Also: fail2ban.actions: [jail] Ban/Unban/Restore Ban IP
  const actionPattern = /fail2ban\.(?:actions?|action)(?:\[[^\]]+\])?:\s+(?:NOTICE|WARNING|INFO|ERROR)?\s*\[([^\]]+)\]\s+(Ban|Unban|Restore\s+Ban)\s+(\d+\.\d+\.\d+\.\d+)/i;
  // More flexible timestamp pattern - handles with/without milliseconds
  const timestampPattern = /^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})(?:,(\d{3}))?/;

  let parsedCount = 0;
  let skippedCount = 0;

  for (const line of lines) {
    // Extract timestamp
    const timestampMatch = line.match(timestampPattern);
    if (!timestampMatch) {
      skippedCount++;
      continue;
    }

    const [, date, time, milliseconds] = timestampMatch;
    const timestampStr = milliseconds ? `${date}T${time}.${milliseconds}Z` : `${date}T${time}Z`;
    let timestamp;
    try {
      timestamp = new Date(timestampStr).toISOString();
    } catch (err) {
      console.warn(`[BAN HISTORY PARSER] Failed to parse timestamp: ${timestampStr}`);
      skippedCount++;
      continue;
    }

    // Extract action (ban/unban/restore)
    const actionMatch = line.match(actionPattern);
    if (!actionMatch) {
      skippedCount++;
      continue;
    }

    const [, jailName, action, ip] = actionMatch;

    // Normalize action
    let normalizedAction = action.toLowerCase().trim();
    if (normalizedAction === 'restore ban' || normalizedAction === 'restoreban') {
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
    parsedCount++;
  }

  if (process.env.NODE_ENV === 'development') {
    console.log(`[BAN HISTORY PARSER] Parsed ${parsedCount} events, skipped ${skippedCount} lines, total lines: ${lines.length}`);
    if (jailFilter) {
      console.log(`[BAN HISTORY PARSER] Filtering by jail: ${jailFilter}`);
    }
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

  let logContent = '';
  let readError = null;

  // Try to read directly first (if file is readable without sudo)
  try {
    const fileContent = fs.readFileSync(FAIL2BAN_LOG_PATH, 'utf8');
    const lines = fileContent.split('\n');
    const readLimit = jailFilter ? limit * 10 : limit * 5;
    // Get last N lines
    logContent = lines.slice(-readLimit).join('\n');
    if (process.env.NODE_ENV === 'development') {
      console.log(`[BAN HISTORY PARSER] Read log file directly (no sudo needed)`);
    }
  } catch (directReadError) {
    // If direct read fails, try using sudo script
    if (process.env.NODE_ENV === 'development') {
      console.log(`[BAN HISTORY PARSER] Direct read failed, trying sudo script: ${directReadError.message}`);
    }
    readError = directReadError;
    
    try {
      // Read log file using helper script to get last N lines
      // Use larger limit to account for filtering and ensure we get enough events
      const readLimit = jailFilter ? limit * 10 : limit * 5; // Read more lines if filtering
      // __dirname is backend/src/services, so we need to go up two levels to reach backend/scripts
      const scriptPath = path.resolve(__dirname, '../../scripts/read-fail2ban-log.sh');
      const { stdout, stderr } = await execFileAsync(
        SUDO_PATH,
        [scriptPath, String(readLimit)],
        {
          timeout: 10000,
          maxBuffer: 5 * 1024 * 1024,
          encoding: 'utf8',
        }
      );

      if (stderr && !stdout) {
        throw new Error(`Failed to read fail2ban log: ${stderr}`);
      }

      logContent = stdout || '';
    if (process.env.NODE_ENV === 'development') {
      console.log(`[BAN HISTORY PARSER] Read ${logContent.split('\n').length} lines from log file`);
      if (logContent.length > 0) {
        console.log(`[BAN HISTORY PARSER] First 500 chars: ${logContent.substring(0, 500)}`);
        // Show sample lines that might contain ban events
        const sampleLines = logContent.split('\n').filter(line => 
          line.toLowerCase().includes('ban') || 
          line.toLowerCase().includes('unban') ||
          line.toLowerCase().includes('restore')
        ).slice(0, 5);
        if (sampleLines.length > 0) {
          console.log(`[BAN HISTORY PARSER] Sample lines with ban/unban:`, sampleLines);
        } else {
          console.log(`[BAN HISTORY PARSER] No lines found containing 'ban', 'unban', or 'restore'`);
        }
      } else {
        console.log(`[BAN HISTORY PARSER] WARNING: Log content is empty!`);
      }
    }

    // Parse the log content
    const events = parseBanHistory(logContent, jailFilter, limit);

    if (process.env.NODE_ENV === 'development') {
      console.log(`[BAN HISTORY PARSER] Returning ${events.length} events`);
    }

    return events;
    } catch (sudoError) {
      // Both direct read and sudo failed
      if (process.env.NODE_ENV === 'development') {
        console.error(`[BAN HISTORY PARSER] Sudo script also failed: ${sudoError.message}`);
      }
      // Check if it's a permission error
      if (sudoError.code === 'ENOENT' || sudoError.message.includes('not found')) {
        throw new Error(`Fail2ban log file not found or not accessible: ${FAIL2BAN_LOG_PATH}`);
      }
      if (sudoError.code === 'EACCES' || sudoError.message.includes('Permission denied') || sudoError.message.includes('password')) {
        throw new Error(`Permission denied: Cannot read ${FAIL2BAN_LOG_PATH}. Check file permissions or sudo configuration. Error: ${sudoError.message}`);
      }
      throw new Error(`Failed to read fail2ban log: ${sudoError.message}`);
    }
  }
}

module.exports = {
  getBanHistory,
  parseBanHistory,
};

