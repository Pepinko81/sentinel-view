const path = require('path');
const config = require('./config');

// Whitelist of allowed scripts - only these can be executed
// These are the actual scripts from the server (single source of truth)
const scriptWhitelist = [
  'test-fail2ban.sh',        // Comprehensive fail2ban test
  'monitor-security.sh',     // Daily monitoring (main script for overview)
  'quick-check.sh',          // Quick status check
  'backup-fail2ban.sh',      // Backup configuration
  'test-filters.sh',         // Filter testing
];

/**
 * Get full path to a script if it's in the whitelist
 * @param {string} scriptName - Name of the script file
 * @returns {string|null} - Full path if whitelisted, null otherwise
 */
function getScriptPath(scriptName) {
  if (!scriptWhitelist.includes(scriptName)) {
    return null;
  }
  
  return path.join(config.scriptsDir, scriptName);
}

/**
 * Validate if a script path is allowed
 * @param {string} scriptPath - Full path to script
 * @returns {boolean} - True if allowed
 */
function isScriptAllowed(scriptPath) {
  const normalized = path.normalize(scriptPath);
  const scriptsDir = path.normalize(config.scriptsDir);
  
  // Must be within scripts directory
  if (!normalized.startsWith(scriptsDir)) {
    return false;
  }
  
  // Must be in whitelist
  const scriptName = path.basename(normalized);
  return scriptWhitelist.includes(scriptName);
}

module.exports = {
  scriptWhitelist,
  getScriptPath,
  isScriptAllowed,
};

