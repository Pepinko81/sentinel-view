const { execFile } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');

const execFileAsync = promisify(execFile);

// Absolute paths
const SUDO_PATH = process.env.SUDO_PATH || '/usr/bin/sudo';
const FAIL2BAN_CLIENT_PATH = process.env.FAIL2BAN_CLIENT_PATH || '/usr/bin/fail2ban-client';
const FAIL2BAN_REGEX_PATH = process.env.FAIL2BAN_REGEX_PATH || '/usr/bin/fail2ban-regex';
const SYSTEMCTL_PATH = process.env.SYSTEMCTL_PATH || '/usr/bin/systemctl';
const TAIL_PATH = process.env.TAIL_PATH || '/usr/bin/tail';

const config = require('../config/config');

// SQLite database
let Database = null;
try {
  Database = require('better-sqlite3');
} catch (err) {
  throw new Error('better-sqlite3 is required. Install with: npm install better-sqlite3');
}

// Import parsers
const { parseFail2banStatus, parseJailStatus } = require('./parsers/fail2banParser');
const { detectFail2banError } = require('./parsers/parserUtils');

/**
 * Validate jail name (alphanumeric, dots, dashes, underscores only)
 */
function validateJailName(jail) {
  if (!jail || typeof jail !== 'string') {
    throw new Error('Jail name is required');
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(jail)) {
    throw new Error(`Invalid jail name: "${jail}". Only alphanumeric characters, dots, dashes, and underscores are allowed.`);
  }
  return true;
}

/**
 * Validate IP address
 */
function validateIP(ip) {
  if (!ip || typeof ip !== 'string') {
    throw new Error('IP address is required');
  }
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
  if (!ipv4Regex.test(ip) && !ipv6Regex.test(ip)) {
    throw new Error(`Invalid IP address: "${ip}"`);
  }
  return true;
}

/**
 * Execute fail2ban-client command
 * Handles NOK responses gracefully (NOK is not always an error)
 */
async function execFail2banClient(args, timeout = 15000, ignoreNOK = false) {
  const command = SUDO_PATH;
  const fullArgs = [FAIL2BAN_CLIENT_PATH, ...args];
  
  try {
    const { stdout, stderr } = await execFileAsync(command, fullArgs, {
      timeout,
      maxBuffer: 5 * 1024 * 1024,
      encoding: 'utf8',
    });

    const errorCheck = detectFail2banError(stdout || '', stderr || '');
    
    // Check if it's a NOK response
    const isNOK = errorCheck.isError && (
      (errorCheck.message || '').toLowerCase().includes('nok') ||
      (stdout || '').toLowerCase().includes('error   nok') ||
      (stdout || '').toLowerCase().includes('error nok') ||
      (stderr || '').toLowerCase().includes('error   nok') ||
      (stderr || '').toLowerCase().includes('error nok')
    );
    
    // If ignoreNOK is true and this is a NOK response, return it as success
    if (isNOK && ignoreNOK) {
      return { stdout, stderr, nok: true };
    }
    
    // If it's a NOK but we don't ignore it, throw error
    if (isNOK && !ignoreNOK) {
      // NOK usually means jail is already in desired state or can't be started/stopped
      const action = args[0] || 'unknown';
      if (action === 'start') {
        throw new Error(`Cannot start jail: jail may be disabled in configuration or already running`);
      } else if (action === 'stop') {
        throw new Error(`Cannot stop jail: jail may already be stopped`);
      } else {
        throw new Error(`Command failed with NOK: ${errorCheck.message || 'fail2ban NOK response'}`);
      }
    }
    
    // Real error (not NOK)
    if (errorCheck.isError && !isNOK) {
      throw new Error(errorCheck.message || 'fail2ban error');
    }

    return { stdout, stderr, nok: false };
  } catch (err) {
    // Re-throw with better context
    if (err.code === 'ETIMEDOUT') {
      throw new Error(`Command timed out after ${timeout}ms: fail2ban-client ${args.join(' ')}`);
    }
    
    // Check if it's a service-down error in the error message
    if (err.message && (err.message.includes('Failed to access socket') || err.message.includes('Is fail2ban running'))) {
      const serviceError = new Error('fail2ban service is not running. Please start the service first using: sudo systemctl start fail2ban');
      serviceError.errorType = 'service_down';
      throw serviceError;
    }
    
    throw err;
  }
}

/**
 * Get global fail2ban status
 * @returns {Promise<{status: string, jails: string[]}>}
 */
async function getGlobalStatus() {
  const { stdout } = await execFail2banClient(['status'], 30000);
  const parsed = parseFail2banStatus(stdout);
  return {
    status: parsed.status || 'unknown',
    jails: parsed.jails || [],
  };
}

/**
 * Get jail status
 * @param {string} jail - Jail name
 * @returns {Promise<object>}
 */
async function getJailStatus(jail) {
  validateJailName(jail);
  const { stdout } = await execFail2banClient(['status', jail], 10000);
  const parsed = parseJailStatus(stdout, jail);
  return parsed;
}

/**
 * Validate jail configuration syntax
 * @param {string} content - Configuration content
 * @returns {Promise<{valid: boolean, errors: string[]}>}
 */
async function validateJailConfig(content) {
  const errors = [];
  const lines = content.split('\n');
  let enabledCount = 0;
  let enabledLineIndex = -1;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    // Skip comments and empty lines
    if (trimmed.startsWith('#') || trimmed === '') {
      continue;
    }
    
    // Check for enabled directive
    if (/^enabled\s*=/i.test(trimmed)) {
      enabledCount++;
      enabledLineIndex = i;
      
      // Extract value
      const match = trimmed.match(/^enabled\s*=\s*(.+)$/i);
      if (match) {
        const value = match[1].trim().toLowerCase();
        // Check for common typos
        if (value === 'fasle' || value === 'flase' || value === 'fales') {
          errors.push(`Line ${i + 1}: Invalid value "${match[1].trim()}" for enabled (should be "true" or "false")`);
        } else if (value !== 'true' && value !== 'false' && value !== '1' && value !== '0') {
          errors.push(`Line ${i + 1}: Invalid value "${match[1].trim()}" for enabled (should be "true" or "false")`);
        }
      }
    }
  }
  
  // Check for duplicate enabled directives
  if (enabledCount > 1) {
    errors.push(`Multiple "enabled" directives found (${enabledCount} occurrences). Only one is allowed.`);
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Update enabled setting in jail configuration
 * @param {string} jail - Jail name
 * @param {boolean} enabled - New enabled value
 * @returns {Promise<void>}
 */
async function updateJailEnabled(jail, enabled) {
  try {
    // Read current config
    const configData = await readJailConfig(jail);
    
    // If jail is from jail.conf (default config), create override in jail.d
    let targetPath = configData.path;
    if (configData.source === 'jail.conf') {
      // Create jail.d override file
      targetPath = path.join(config.fail2banConfig, 'jail.d', `${jail}.conf`);
      console.log(`[F2B] Jail "${jail}" found in jail.conf, creating override in jail.d`);
    }
    
    const lines = configData.content.split('\n');
    let modified = false;
    let enabledFound = false;
    
    // Find and update enabled line (handle duplicates and invalid values)
    const updatedLines = lines.map((line, index) => {
      const trimmed = line.trim();
      // Match enabled = true/false (case insensitive, with optional spaces)
      // Also match invalid values like "fasle" to fix them
      if (/^enabled\s*=/i.test(trimmed) && !trimmed.startsWith('#')) {
        if (enabledFound) {
          // Duplicate enabled line - comment it out
          return `# ${line} # Duplicate, removed`;
        }
        enabledFound = true;
        modified = true;
        return `enabled = ${enabled}`;
      }
      return line;
    });
    
    // If enabled line not found, add it after [jail] header
    if (!modified) {
      for (let i = 0; i < updatedLines.length; i++) {
        if (updatedLines[i].trim() === `[${jail}]`) {
          updatedLines.splice(i + 1, 0, `enabled = ${enabled}`);
          modified = true;
          break;
        }
      }
    }
    
    if (modified) {
      const newContent = updatedLines.join('\n');
      
      // Validate configuration before writing
      const validation = await validateJailConfig(newContent);
      if (!validation.valid) {
        throw new Error(`Invalid jail configuration: ${validation.errors.join('; ')}`);
      }
      
      await writeJailConfig(jail, newContent, targetPath);
    }
  } catch (err) {
    // If config read/write fails, throw error (don't silently fail)
    throw new Error(`Failed to update enabled setting for ${jail}: ${err.message}`);
  }
}

/**
 * Extract logpath from jail configuration
 * @param {string} configContent - Jail configuration content
 * @returns {string|null} - Log path or null if not found
 */
function extractLogPath(configContent) {
  const lines = configContent.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    // Match logpath = /path/to/log
    const match = trimmed.match(/^logpath\s*=\s*(.+)$/i);
    if (match && !trimmed.startsWith('#')) {
      // Remove quotes if present
      let logPath = match[1].trim();
      if ((logPath.startsWith('"') && logPath.endsWith('"')) ||
          (logPath.startsWith("'") && logPath.endsWith("'"))) {
        logPath = logPath.slice(1, -1);
      }
      return logPath;
    }
  }
  return null;
}

/**
 * Validate jail configuration (check log file exists)
 * @param {string} jail - Jail name
 * @returns {Promise<{valid: boolean, error?: string}>}
 */
async function validateJailBeforeStart(jail) {
  try {
    // Read jail configuration
    const configData = await readJailConfig(jail);
    
    // Extract logpath
    const logPath = extractLogPath(configData.content);
    
    if (!logPath) {
      // No logpath specified - this might be OK for some jails
      return { valid: true };
    }
    
    // Check if log file exists (with sudo if needed)
    try {
      await execFileAsync(SUDO_PATH, ['test', '-f', logPath], { timeout: 5000 });
      return { valid: true };
    } catch (err) {
      // File doesn't exist - check if it's a directory or wildcard pattern
      try {
        await execFileAsync(SUDO_PATH, ['test', '-d', logPath], { timeout: 5000 });
        // It's a directory, which is valid for some log configurations
        return { valid: true };
      } catch (dirErr) {
        // Check if it's a wildcard pattern
        if (logPath.includes('*') || logPath.includes('?')) {
          // Wildcard pattern - let fail2ban handle it
          return { valid: true };
        }
        
        // Log file doesn't exist
        return {
          valid: false,
          error: `Log file not found: ${logPath}. Please ensure the log file exists or update the logpath in the jail configuration.`,
        };
      }
    }
  } catch (err) {
    // If we can't validate, let fail2ban handle it
    console.warn(`[F2B] Could not validate jail "${jail}" before start: ${err.message}`);
    return { valid: true };
  }
}

/**
 * Start a jail
 * @param {string} jail - Jail name
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function startJail(jail) {
  validateJailName(jail);
  
  // Check if jail is already running
  try {
    const globalStatus = await getGlobalStatus();
    if (globalStatus.jails.includes(jail)) {
      // Jail is already running, just ensure config is correct
      await updateJailEnabled(jail, true);
      return {
        success: true,
        message: `Jail "${jail}" is already running`,
      };
    }
  } catch (err) {
    // If we can't check, continue with enabling
  }
  
  // Validate jail configuration before starting (check log file exists)
  const validation = await validateJailBeforeStart(jail);
  if (!validation.valid) {
    throw new Error(validation.error || `Cannot start jail "${jail}": Configuration validation failed`);
  }
  
  // Update enabled = true in config file
  await updateJailEnabled(jail, true);
  
  // Try to start the jail directly first
  try {
    const result = await execFail2banClient(['start', jail], 15000, false); // Don't ignore NOK
    
    // If successful, return
    return {
      success: true,
      message: `Jail "${jail}" started successfully`,
    };
  } catch (err) {
    // Check if error message indicates configuration problem
    const errorMsg = err.message || '';
    const isConfigError = 
      errorMsg.toLowerCase().includes('configuration') ||
      errorMsg.toLowerCase().includes('syntax') ||
      errorMsg.toLowerCase().includes('invalid') ||
      errorMsg.toLowerCase().includes('parse') ||
      errorMsg.toLowerCase().includes('error reading');
    
    if (isConfigError) {
      // Configuration error - don't restart, just report the error
      throw new Error(`Cannot start jail "${jail}": Configuration error. ${errorMsg}. Please check jail configuration file for syntax errors (e.g., duplicate "enabled" directives, invalid values like "fasle" instead of "false").`);
    }
    
    // If start fails (likely because jail was disabled in config), restart fail2ban
    // This will apply the enabled = true change we just made
    console.log(`[F2B] Direct start failed for ${jail}, restarting fail2ban to apply config change`);
    
    try {
      await restartFail2ban();
    } catch (restartErr) {
      // If restart fails, check fail2ban logs for configuration errors
      throw new Error(`Cannot start jail "${jail}": Failed to restart fail2ban. This may indicate a configuration error. Check /var/log/fail2ban.log for details. Original error: ${err.message}`);
    }
    
    // Verify jail is now running
    try {
      const globalStatus = await getGlobalStatus();
      if (globalStatus.jails.includes(jail)) {
        return {
          success: true,
          message: `Jail "${jail}" enabled and started (fail2ban restarted)`,
        };
      } else {
        // Jail still not running after restart - configuration error
        throw new Error(`Jail "${jail}" did not start after restart. This indicates a configuration error. Check /var/log/fail2ban.log for details. Common issues: duplicate "enabled" directives, invalid values (e.g., "fasle" instead of "false"), or missing required parameters.`);
      }
    } catch (statusErr) {
      // Try to read fail2ban log for more details
      const { readFail2banLog } = require('./parsers/parserUtils');
      let logDetails = '';
      try {
        const logContent = await readFail2banLog(jail, 20);
        if (logContent) {
          logDetails = `\nRecent fail2ban log entries:\n${logContent}`;
        }
      } catch (logErr) {
        // Ignore log read errors
      }
      
      // If we can't verify, assume config error
      throw new Error(`Jail "${jail}" enabled in configuration but did not start. This indicates a configuration error.${logDetails}\n\nCommon issues:\n- Duplicate "enabled" directives\n- Invalid values (e.g., "fasle" instead of "false")\n- Missing required parameters (filter, logpath, etc.)\n- Syntax errors in configuration file`);
    }
  }
}

/**
 * Stop a jail
 * @param {string} jail - Jail name
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function stopJail(jail) {
  validateJailName(jail);
  
  // First, stop the jail runtime
  const result = await execFail2banClient(['stop', jail], 15000, true); // ignoreNOK = true
  
  // Then, update enabled = false in config file
  await updateJailEnabled(jail, false);
  
  // If we got NOK, it might mean jail is already stopped
  if (result.nok) {
    // Check if jail is actually stopped
    try {
      const globalStatus = await getGlobalStatus();
      if (!globalStatus.jails.includes(jail)) {
        return {
          success: true,
          message: `Jail "${jail}" stopped and disabled in configuration`,
        };
      }
    } catch (statusErr) {
      // Config was updated, assume it's stopped
      return {
        success: true,
        message: `Jail "${jail}" stopped and disabled in configuration`,
      };
    }
  }
  
  return {
    success: true,
    message: `Jail "${jail}" stopped and disabled in configuration`,
  };
}

/**
 * Unban an IP from a jail
 * @param {string} jail - Jail name
 * @param {string} ip - IP address
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function unbanIP(jail, ip) {
  validateJailName(jail);
  validateIP(ip);
  await execFail2banClient(['set', jail, 'unbanip', ip], 10000);
  return {
    success: true,
    message: `IP "${ip}" unbanned from jail "${jail}"`,
  };
}

/**
 * Restart fail2ban service
 * @returns {Promise<{success: boolean, message: string}>}
 */
async function restartFail2ban() {
  const command = SUDO_PATH;
  const args = [SYSTEMCTL_PATH, 'restart', 'fail2ban'];
  
  try {
    await execFileAsync(command, args, {
      timeout: 30000,
      maxBuffer: 1024 * 1024,
      encoding: 'utf8',
    });
    
    // Wait a moment for service to restart
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    return {
      success: true,
      message: 'Fail2ban service restarted successfully',
    };
  } catch (err) {
    throw new Error(`Failed to restart fail2ban: ${err.message}`);
  }
}

/**
 * Read ban history from SQLite database
 * @param {string} jail - Optional jail name filter
 * @param {number} limit - Maximum number of records to return
 * @returns {Promise<Array<{jail: string, ip: string, timeofban: number, bantime: number, action: string}>>}
 */
async function readBanHistory(jail = null, limit = 100) {
  const dbPath = config.fail2ban.db;
  
  if (!fs.existsSync(dbPath)) {
    console.warn(`[F2B] Database file not found: ${dbPath}`);
    return [];
  }
  
  try {
    const db = new Database(dbPath, { readonly: true });
    
    let query = 'SELECT jail, ip, timeofban, bantime FROM bans';
    const params = [];
    
    if (jail) {
      query += ' WHERE jail = ?';
      params.push(jail);
    }
    
    query += ' ORDER BY timeofban DESC LIMIT ?';
    params.push(limit);
    
    const rows = db.prepare(query).all(...params);
    db.close();
    
    return rows.map(row => ({
      jail: row.jail,
      ip: row.ip,
      timeofban: row.timeofban,
      bantime: row.bantime,
      action: 'ban',
    }));
  } catch (err) {
    // Handle permission errors gracefully - database might be readable only by root
    if (err.message && (err.message.includes('unable to open database file') || err.message.includes('EACCES'))) {
      console.warn(`[F2B] Cannot access database file (permission denied): ${dbPath}. Database may be readable only by root.`);
      return [];
    }
    console.error(`[F2B] Error reading ban history: ${err.message}`);
    return [];
  }
}

/**
 * Create a filter file
 * @param {string} name - Filter name
 * @param {string} failregex - Fail regex pattern
 * @param {string|null} ignoreregex - Optional ignore regex pattern
 * @returns {Promise<{success: boolean, message: string, filterPath: string}>}
 */
async function createFilter(name, failregex, ignoreregex = null) {
  if (!name || typeof name !== 'string') {
    throw new Error('Filter name is required');
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(name)) {
    throw new Error(`Invalid filter name: "${name}". Only alphanumeric characters, dots, dashes, and underscores are allowed.`);
  }
  if (!failregex || typeof failregex !== 'string' || failregex.trim() === '') {
    throw new Error('Fail regex is required');
  }
  
  const filterDir = config.fail2ban.filterDir;
  const filterPath = path.join(filterDir, `${name}.conf`);
  
  // Check if filter already exists (try with sudo if direct check fails)
  let filterExists = false;
  try {
    if (fs.existsSync(filterPath)) {
      filterExists = true;
    } else {
      // Try with sudo check (file might exist but not readable without sudo)
      try {
        await execFileAsync(SUDO_PATH, ['test', '-f', filterPath], { timeout: 5000 });
        filterExists = true;
      } catch (sudoErr) {
        // File doesn't exist
        filterExists = false;
      }
    }
  } catch (err) {
    // If we can't check, assume it doesn't exist and let the write fail if it does
    filterExists = false;
  }
  
  if (filterExists) {
    throw new Error(`Filter "${name}" already exists at ${filterPath}. Please use a different name or edit the existing filter manually.`);
  }
  
  // Build filter content
  let content = '[Definition]\n';
  content += `failregex = ${failregex}\n`;
  if (ignoreregex && ignoreregex.trim() !== '') {
    content += `ignoreregex = ${ignoreregex}\n`;
  }
  
  // Validate regex using fail2ban-regex (dry run)
  // Write content to temp file for validation
  const validationTempFile = path.join(__dirname, `../tmp/${name}-validation.conf.tmp`);
  const validationTempDir = path.dirname(validationTempFile);
  if (!fs.existsSync(validationTempDir)) {
    fs.mkdirSync(validationTempDir, { recursive: true });
  }
  fs.writeFileSync(validationTempFile, content, 'utf8');
  
  try {
    const command = SUDO_PATH;
    const args = [FAIL2BAN_REGEX_PATH, '/dev/null', validationTempFile];
    
    await execFileAsync(command, args, {
      timeout: 10000,
      maxBuffer: 1024 * 1024,
      encoding: 'utf8',
    });
  } catch (err) {
    // If validation fails, still allow creation but warn
    console.warn(`[F2B] Regex validation warning for filter "${name}": ${err.message}`);
  } finally {
    // Clean up validation temp file
    if (fs.existsSync(validationTempFile)) {
      fs.unlinkSync(validationTempFile);
    }
  }
  
  // Write filter file using sudo
  const tempFile = path.join(__dirname, `../tmp/${name}.conf.tmp`);
  const tempDir = path.dirname(tempFile);
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  fs.writeFileSync(tempFile, content, 'utf8');
  
  try {
    // Copy temp file to final location with sudo
    await execFileAsync(SUDO_PATH, ['cp', tempFile, filterPath], { timeout: 10000 });
    // Set correct permissions
    await execFileAsync(SUDO_PATH, ['chmod', '644', filterPath], { timeout: 5000 });
  } catch (err) {
    // Clean up temp file
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
    throw new Error(`Failed to write filter file: ${err.message}`);
  }
  
  // Clean up temp file
  if (fs.existsSync(tempFile)) {
    fs.unlinkSync(tempFile);
  }
  
  return {
    success: true,
    message: `Filter "${name}" created successfully`,
    filterPath,
  };
}

/**
 * Read jail configuration file
 * @param {string} jail - Jail name
 * @returns {Promise<{content: string, path: string}>}
 */
async function readJailConfig(jail) {
  validateJailName(jail);
  
  const jailD = path.join(config.fail2banConfig, 'jail.d', `${jail}.conf`);
  const jailLocal = path.join(config.fail2banConfig, 'jail.local');
  const jailConf = path.join(config.fail2banConfig, 'jail.conf');
  
  let configPath = null;
  let content = '';
  
  // Helper function to extract jail section from content
  const extractJailSection = (fileContent, fileName) => {
    const escapedJail = jail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const jailSectionRegex = new RegExp(`(\\[${escapedJail}\\]\\s*\\n)([\\s\\S]*?)(?=\\n\\[|\\z)`, 'm');
    const match = fileContent.match(jailSectionRegex);
    
    if (match) {
      let sectionContent = match[1] + match[2];
      sectionContent = sectionContent.replace(/\n+$/, '');
      return sectionContent;
    }
    
    // Fallback: try line-by-line parsing if regex fails
    const lines = fileContent.split('\n');
    let inSection = false;
    let sectionLines = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.trim() === `[${jail}]`) {
        inSection = true;
        sectionLines.push(line);
        continue;
      }
      if (inSection) {
        // Stop if we hit another section
        if (line.trim().startsWith('[') && line.trim().endsWith(']')) {
          break;
        }
        sectionLines.push(line);
      }
    }
    
    return sectionLines.length > 0 ? sectionLines.join('\n') : null;
  };
  
  // Helper function to read file (with sudo fallback)
  const readFileContent = async (filePath) => {
    try {
      return fs.readFileSync(filePath, 'utf8');
    } catch (err) {
      // If direct read fails, try with sudo
      const { stdout } = await execFileAsync(SUDO_PATH, ['cat', filePath], {
        timeout: 5000,
        maxBuffer: 1024 * 1024,
        encoding: 'utf8',
      });
      return stdout;
    }
  };
  
  // Priority 1: Check jail.d first (highest priority)
  if (fs.existsSync(jailD)) {
    configPath = jailD;
    content = await readFileContent(jailD);
    return {
      content,
      path: configPath,
    };
  }
  
  // Priority 2: Check jail.local
  if (fs.existsSync(jailLocal)) {
    const jailLocalContent = await readFileContent(jailLocal);
    const section = extractJailSection(jailLocalContent, 'jail.local');
    if (section) {
      configPath = jailLocal;
      content = section;
      return {
        content,
        path: configPath,
      };
    }
  }
  
  // Priority 3: Check jail.conf (default fail2ban configuration)
  if (fs.existsSync(jailConf)) {
    const jailConfContent = await readFileContent(jailConf);
    const section = extractJailSection(jailConfContent, 'jail.conf');
    if (section) {
      // Jail exists in jail.conf, but we should create override in jail.d for editing
      // For now, return the content from jail.conf but note that edits should go to jail.d
      configPath = jailConf;
      content = section;
      return {
        content,
        path: configPath,
        source: 'jail.conf', // Indicate this is from default config
      };
    }
  }
  
  // Jail not found in any config file
  throw new Error(`Jail configuration not found for "${jail}". Jail may not be configured or may be in a non-standard location.`);
}

/**
 * Write jail configuration file
 * @param {string} jail - Jail name
 * @param {string} content - Configuration content
 * @param {string} targetPath - Optional: specific path to write to (if editing existing file)
 * @returns {Promise<{success: boolean, message: string, path: string}>}
 */
async function writeJailConfig(jail, content, targetPath = null) {
  validateJailName(jail);
  
  if (!content || typeof content !== 'string') {
    throw new Error('Configuration content is required');
  }
  
  let configPath = targetPath;
  let isJailLocal = false;
  
  // If no target path specified, determine where to write
  if (!configPath) {
    const jailD = path.join(config.fail2banConfig, 'jail.d', `${jail}.conf`);
    const jailLocal = path.join(config.fail2banConfig, 'jail.local');
    
    // Check if jail exists in jail.d
    if (fs.existsSync(jailD)) {
      configPath = jailD;
    } else {
      // Check if jail exists in jail.local
      let jailLocalContent = '';
      try {
        jailLocalContent = fs.readFileSync(jailLocal, 'utf8');
      } catch (err) {
        try {
          const { stdout } = await execFileAsync(SUDO_PATH, ['cat', jailLocal], {
            timeout: 5000,
            maxBuffer: 1024 * 1024,
            encoding: 'utf8',
          });
          jailLocalContent = stdout;
        } catch (sudoErr) {
          // File doesn't exist or can't read
        }
      }
      
      if (jailLocalContent.includes(`[${jail}]`)) {
        // Jail exists in jail.local - we need to update it there
        configPath = jailLocal;
        isJailLocal = true;
      } else {
        // Jail doesn't exist - create in jail.d
        configPath = jailD;
      }
    }
  } else {
    // Target path specified - check if it's jail.local
    isJailLocal = configPath.includes('jail.local');
  }
  
  // Create temp file in /tmp (more reliable for sudo)
  const tempFile = `/tmp/fail2ban-${jail}-${Date.now()}.conf.tmp`;
  
  try {
    if (isJailLocal) {
      // Update jail.local - need to replace the section
      let jailLocalPath = path.join(config.fail2banConfig, 'jail.local');
      let jailLocalContent = '';
      
      // Read current jail.local
      try {
        jailLocalContent = fs.readFileSync(jailLocalPath, 'utf8');
      } catch (err) {
        const { stdout } = await execFileAsync(SUDO_PATH, ['cat', jailLocalPath], {
          timeout: 5000,
          maxBuffer: 1024 * 1024,
          encoding: 'utf8',
        });
        jailLocalContent = stdout;
      }
      
      // Replace the jail section
      const escapedJail = jail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const jailSectionRegex = new RegExp(`\\[${escapedJail}\\][\\s\\S]*?(?=\\n\\[|\\z)`, 'm');
      
      let newContent;
      if (jailSectionRegex.test(jailLocalContent)) {
        // Replace existing section
        newContent = jailLocalContent.replace(jailSectionRegex, content.trim() + '\n');
      } else {
        // Append new section
        newContent = jailLocalContent.trimEnd() + '\n\n' + content.trim() + '\n';
      }
      
      // Write updated content to temp file
      fs.writeFileSync(tempFile, newContent, 'utf8');
      
      // Copy updated file back with sudo
      await execFileAsync(SUDO_PATH, ['cp', tempFile, jailLocalPath], { timeout: 10000 });
      await execFileAsync(SUDO_PATH, ['chmod', '644', jailLocalPath], { timeout: 5000 });
      configPath = jailLocalPath;
    } else {
      // Write to jail.d - write only the jail section content
      fs.writeFileSync(tempFile, content, 'utf8');
      const jailD = path.join(config.fail2banConfig, 'jail.d');
      await execFileAsync(SUDO_PATH, ['mkdir', '-p', jailD], { timeout: 5000 });
      await execFileAsync(SUDO_PATH, ['cp', tempFile, configPath], { timeout: 10000 });
      await execFileAsync(SUDO_PATH, ['chmod', '644', configPath], { timeout: 5000 });
    }
  } catch (err) {
    // Clean up temp file
    if (fs.existsSync(tempFile)) {
      try {
        fs.unlinkSync(tempFile);
      } catch (cleanupErr) {
        // Ignore cleanup errors
      }
    }
    throw new Error(`Failed to write jail configuration: ${err.message}`);
  }
  
  // Clean up temp file
  if (fs.existsSync(tempFile)) {
    try {
      fs.unlinkSync(tempFile);
    } catch (cleanupErr) {
      // Ignore cleanup errors
    }
  }
  
  return {
    success: true,
    message: `Jail configuration saved successfully`,
    path: configPath,
  };
}

/**
 * Get active bans from SQLite database
 * @returns {Promise<Array<{jail: string, ip: string, timeofban: number, bantime: number}>>}
 */
async function getActiveBans() {
  const dbPath = config.fail2ban.db;
  
  if (!fs.existsSync(dbPath)) {
    return [];
  }
  
  try {
    const db = new Database(dbPath, { readonly: true });
    const now = Math.floor(Date.now() / 1000);
    
    const query = `
      SELECT jail, ip, timeofban, bantime 
      FROM bans 
      WHERE (timeofban + bantime) > ?
      ORDER BY timeofban DESC
    `;
    
    const rows = db.prepare(query).all(now);
    db.close();
    
    return rows;
  } catch (err) {
    // Handle permission errors gracefully - database might be readable only by root
    if (err.message && (err.message.includes('unable to open database file') || err.message.includes('EACCES'))) {
      console.warn(`[F2B] Cannot access database file (permission denied): ${dbPath}. Database may be readable only by root.`);
      return [];
    }
    console.error(`[F2B] Error reading active bans: ${err.message}`);
    return [];
  }
}

module.exports = {
  getGlobalStatus,
  getJailStatus,
  startJail,
  stopJail,
  unbanIP,
  restartFail2ban,
  readBanHistory,
  createFilter,
  readJailConfig,
  writeJailConfig,
  getActiveBans,
};

