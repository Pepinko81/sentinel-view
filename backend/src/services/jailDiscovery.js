const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const { execFile } = require('child_process');
const config = require('../config/config');

const execFileAsync = promisify(execFile);

// Absolute paths
const SUDO_PATH = process.env.SUDO_PATH || '/usr/bin/sudo';
const FAIL2BAN_CONFIG_DIR = process.env.FAIL2BAN_CONFIG_DIR || '/etc/fail2ban';
const FAIL2BAN_CLIENT_PATH = process.env.FAIL2BAN_CLIENT_PATH || '/usr/bin/fail2ban-client';

/**
 * Discover all configured jails by scanning fail2ban config files.
 * This is the SOURCE OF TRUTH for jail existence.
 * 
 * Scans in order (later files override earlier):
 * - /etc/fail2ban/jail.conf (default fail2ban configuration)
 * - /etc/fail2ban/jail.d/*.conf (package-specific overrides)
 * - /etc/fail2ban/jail.local (local overrides)
 * 
 * @returns {Promise<string[]>} Array of jail names
 */
async function discoverConfiguredJails() {
  const jailNames = new Set();
  const errors = [];

  try {
    // 1. Scan jail.conf (default fail2ban configuration)
    // This contains standard jails that come with fail2ban installation
    const jailConfPath = path.join(FAIL2BAN_CONFIG_DIR, 'jail.conf');
    if (fs.existsSync(jailConfPath)) {
      try {
        const content = fs.readFileSync(jailConfPath, 'utf8');
        const jails = extractJailNamesFromConfig(content);
        jails.forEach(name => jailNames.add(name));
        if (process.env.NODE_ENV === 'development' && jails.length > 0) {
          console.log(`[JAIL DISCOVERY] Found ${jails.length} jails in jail.conf: ${jails.join(', ')}`);
        }
      } catch (err) {
        errors.push(`Failed to read jail.conf: ${err.message}`);
      }
    }

    // 2. Scan jail.d/*.conf files (package-specific overrides)
    // These override settings from jail.conf
    const jailDir = path.join(FAIL2BAN_CONFIG_DIR, 'jail.d');
    if (fs.existsSync(jailDir)) {
      try {
        const files = fs.readdirSync(jailDir);
        for (const file of files) {
          if (file.endsWith('.conf')) {
            const filePath = path.join(jailDir, file);
            try {
              const content = fs.readFileSync(filePath, 'utf8');
              const jails = extractJailNamesFromConfig(content);
              jails.forEach(name => jailNames.add(name));
            } catch (err) {
              errors.push(`Failed to read ${file}: ${err.message}`);
            }
          }
        }
      } catch (err) {
        errors.push(`Failed to read jail.d directory: ${err.message}`);
      }
    }

    // 3. Scan jail.local (local overrides)
    // This is the highest priority and overrides everything
    const jailLocalPath = path.join(FAIL2BAN_CONFIG_DIR, 'jail.local');
    if (fs.existsSync(jailLocalPath)) {
      try {
        const content = fs.readFileSync(jailLocalPath, 'utf8');
        const jails = extractJailNamesFromConfig(content);
        jails.forEach(name => jailNames.add(name));
      } catch (err) {
        errors.push(`Failed to read jail.local: ${err.message}`);
      }
    }

    // Fallback: if no config files found, try fail2ban-client status
    // This handles cases where configs are in non-standard locations
    if (jailNames.size === 0) {
      try {
        const args = [FAIL2BAN_CLIENT_PATH, 'status'];
        const { stdout } = await execFileAsync(SUDO_PATH, args, {
          timeout: 10000,
          maxBuffer: 1024 * 1024,
          encoding: 'utf8',
        });
        
        // Parse jail list from status output
        const lines = stdout.split('\n');
        for (const line of lines) {
          if (line.toLowerCase().includes('jail list')) {
            const cleaned = line.replace(/^[`|\-|\s\t]+/, '').trim();
            const match = cleaned.match(/jail\s*list[:\s\t]+(.+)/i);
            if (match && match[1]) {
              const jails = match[1]
                .split(',')
                .map(j => j.trim())
                .filter(j => j && j !== '' && j !== '-');
              jails.forEach(name => jailNames.add(name));
            }
          }
        }
      } catch (err) {
        errors.push(`Fallback to fail2ban-client status failed: ${err.message}`);
      }
    }

    if (process.env.NODE_ENV === 'development') {
      console.log(`[JAIL DISCOVERY] Found ${jailNames.size} configured jails: ${Array.from(jailNames).join(', ')}`);
      if (errors.length > 0) {
        console.warn(`[JAIL DISCOVERY] Warnings: ${errors.join('; ')}`);
      }
    }

    return {
      jails: Array.from(jailNames).sort(),
      errors: errors.length > 0 ? errors : undefined,
    };
  } catch (err) {
    throw new Error(`Jail discovery failed: ${err.message}`);
  }
}

/**
 * Extract jail names from fail2ban config file content.
 * Looks for [jail-name] sections.
 * 
 * @param {string} content - Config file content
 * @returns {string[]} Array of jail names
 */
function extractJailNamesFromConfig(content) {
  const jailNames = [];
  // Match [jail-name] sections
  // Examples: [sshd], [nginx-404], [DEFAULT] (skip DEFAULT)
  const jailSectionRegex = /^\[([^\]]+)\]/gm;
  let match;
  
  while ((match = jailSectionRegex.exec(content)) !== null) {
    const jailName = match[1].trim();
    // Skip DEFAULT section and empty names
    if (jailName && jailName.toLowerCase() !== 'default') {
      jailNames.push(jailName);
    }
  }
  
  return jailNames;
}

/**
 * Get runtime state for a jail by attempting status command.
 * 
 * @param {string} jailName
 * @returns {Promise<{ enabled: boolean, status?: object }>}
 */
async function getJailRuntimeState(jailName) {
  try {
    const args = [FAIL2BAN_CLIENT_PATH, 'status', jailName];
    const { stdout, stderr } = await execFileAsync(SUDO_PATH, args, {
      timeout: 5000, // Reduced timeout for faster response (5 seconds instead of 10)
      maxBuffer: 5 * 1024 * 1024,
      encoding: 'utf8',
    });

    const { detectFail2banError } = require('./parsers/parserUtils');
    const errorCheck = detectFail2banError(stdout, stderr);
    
    if (errorCheck.isError) {
      // Check if it's a "does not exist" error (jail is disabled)
      const message = (errorCheck.message || '').toLowerCase();
      if (
        message.includes('does not exist') ||
        message.includes('no such jail') ||
        message.includes('jail not found') ||
        message.includes('error   nok') ||
        message.includes('error nok')
      ) {
        return { enabled: false };
      }
      // Other errors propagate
      throw new Error(errorCheck.message || 'fail2ban error');
    }

    // Parse status to get banned info
    const { parseJailStatus } = require('./parsers/fail2banParser');
    const parsed = parseJailStatus(stdout, jailName);
    
    return {
      enabled: true,
      status: parsed,
    };
  } catch (err) {
    // If command fails with "does not exist", jail is disabled
    const message = (err.message || '').toLowerCase();
    if (
      message.includes('does not exist') ||
      message.includes('no such jail') ||
      message.includes('jail not found') ||
      message.includes('error   nok') ||
      message.includes('error nok')
    ) {
      return { enabled: false };
    }
    
    // If process was killed (timeout), assume jail is disabled or unavailable
    // This prevents slow requests from blocking the entire API
    if (err.killed === true || err.code === 'ETIMEDOUT') {
      console.warn(`[JAIL DISCOVERY] Timeout getting status for ${jailName}, assuming disabled`);
      return { enabled: false };
    }
    
    // Other errors propagate
    throw err;
  }
}

module.exports = {
  discoverConfiguredJails,
  getJailRuntimeState,
  extractJailNamesFromConfig,
};

