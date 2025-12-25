const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const { execFile } = require('child_process');
const config = require('../config/config');

const execFileAsync = promisify(execFile);

const FAIL2BAN_CONFIG_DIR = process.env.FAIL2BAN_CONFIG_DIR || '/etc/fail2ban';
const FAIL2BAN_FILTER_DIR = path.join(FAIL2BAN_CONFIG_DIR, 'filter.d');
const FAIL2BAN_REGEX_PATH = process.env.FAIL2BAN_REGEX_PATH || '/usr/bin/fail2ban-regex';
const SUDO_PATH = process.env.SUDO_PATH || '/usr/bin/sudo';

/**
 * Get jail configuration from config files
 * @param {string} jailName
 * @returns {Promise<{ configFile: string, config: object }>}
 */
async function getJailConfig(jailName) {
  const configFiles = [];
  
  // Check jail.local first (highest priority)
  const jailLocalPath = path.join(FAIL2BAN_CONFIG_DIR, 'jail.local');
  if (fs.existsSync(jailLocalPath)) {
    configFiles.push(jailLocalPath);
  }
  
  // Check jail.d/*.conf files (package-specific overrides)
  const jailDir = path.join(FAIL2BAN_CONFIG_DIR, 'jail.d');
  if (fs.existsSync(jailDir)) {
    const files = fs.readdirSync(jailDir);
    for (const file of files) {
      if (file.endsWith('.conf')) {
        configFiles.push(path.join(jailDir, file));
      }
    }
  }
  
  // Check jail.conf last (default fail2ban configuration)
  const jailConfPath = path.join(FAIL2BAN_CONFIG_DIR, 'jail.conf');
  if (fs.existsSync(jailConfPath)) {
    configFiles.push(jailConfPath);
  }
  
  // Search for jail configuration (in priority order)
  for (const configFile of configFiles) {
    try {
      const content = fs.readFileSync(configFile, 'utf8');
      const jailConfig = extractJailConfig(content, jailName);
      if (jailConfig) {
        return {
          configFile,
          config: jailConfig,
        };
      }
    } catch (err) {
      // Continue to next file
    }
  }
  
  return null;
}

/**
 * Extract jail configuration from config file content
 * @param {string} content - Config file content
 * @param {string} jailName - Jail name to extract
 * @returns {object|null} - Jail configuration object
 */
function extractJailConfig(content, jailName) {
  const lines = content.split('\n');
  let inJailSection = false;
  let inDefaultSection = false;
  const config = {};
  const defaultConfig = {};
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Check for DEFAULT section
    if (line === '[DEFAULT]') {
      inDefaultSection = true;
      inJailSection = false;
      continue;
    }
    
    // Check for jail section start
    if (line === `[${jailName}]`) {
      inJailSection = true;
      inDefaultSection = false;
      continue;
    }
    
    // Check for next section (end of current section)
    if ((inJailSection || inDefaultSection) && line.startsWith('[') && line.endsWith(']')) {
      if (inJailSection) {
        break; // End of jail section
      }
      inDefaultSection = false;
      continue;
    }
    
    // Parse configuration lines
    if ((inJailSection || inDefaultSection) && line.includes('=') && !line.startsWith('#')) {
      const [key, ...valueParts] = line.split('=');
      const keyTrimmed = key.trim();
      let value = valueParts.join('=').trim();
      
      // Convert boolean values (case-insensitive)
      if (keyTrimmed === 'enabled') {
        value = value.toLowerCase() === 'true' || value === '1';
      }
      
      if (inJailSection) {
        config[keyTrimmed] = value;
      } else if (inDefaultSection) {
        defaultConfig[keyTrimmed] = value;
      }
    }
  }
  
  // Merge default config with jail-specific config (jail config overrides defaults)
  const mergedConfig = { ...defaultConfig, ...config };
  
  return inJailSection && Object.keys(mergedConfig).length > 0 ? mergedConfig : null;
}

/**
 * Get filter name from jail configuration
 * @param {string} jailName
 * @returns {Promise<string|null>} - Filter name or null if not found
 */
async function getFilterName(jailName) {
  const jailConfig = await getJailConfig(jailName);
  if (!jailConfig || !jailConfig.config) {
    return null;
  }
  
  // Filter name is usually specified as "filter = <name>"
  // If not specified, it defaults to jail name
  return jailConfig.config.filter || jailName;
}

/**
 * Check if filter file exists
 * @param {string} filterName
 * @returns {boolean}
 */
function filterFileExists(filterName) {
  const filterPath = path.join(FAIL2BAN_FILTER_DIR, `${filterName}.conf`);
  return fs.existsSync(filterPath);
}

/**
 * Filter templates for common jail types
 */
const FILTER_TEMPLATES = {
  'nginx-webdav-attacks': `# fail2ban filter configuration for nginx WebDAV attacks
# Detects WebDAV exploitation attempts (PROPFIND, OPTIONS, MKCOL, PUT, DELETE, etc.)

[Definition]

# Match WebDAV methods that are commonly used in attacks
failregex = ^<HOST> -.*"(PROPFIND|OPTIONS|MKCOL|PUT|DELETE|MOVE|COPY|LOCK|UNLOCK).*HTTP.*
            ^<HOST> -.*"PROPFIND.*HTTP.*
            ^<HOST> -.*"OPTIONS.*HTTP.*
            ^<HOST> -.*"MKCOL.*HTTP.*
            ^<HOST> -.*"PUT.*HTTP.*
            ^<HOST> -.*"DELETE.*HTTP.*
            ^<HOST> -.*"MOVE.*HTTP.*
            ^<HOST> -.*"COPY.*HTTP.*
            ^<HOST> -.*"LOCK.*HTTP.*
            ^<HOST> -.*"UNLOCK.*HTTP.*

ignoreregex = 
`,

  'nginx-hidden-files': `# fail2ban filter configuration for nginx hidden files access attempts
# Detects attempts to access hidden files (.env, .git, .aws, etc.)

[Definition]

failregex = ^<HOST> -.*"(GET|POST|HEAD|PROPFIND).*/(\\.env|\\.git|\\.aws|\\.ht|config.*\\.php|\\.svn|\\.hg|\\.bzr).*HTTP.*
            ^<HOST> -.*"(GET|POST|HEAD|PROPFIND).*/(wp-config\\.php|configuration\\.php|config\\.xml|\\.DS_Store|\\.htpasswd).*HTTP.*
            ^<HOST> -.*"(GET|POST|HEAD|PROPFIND).*(/\\.env\\b|/\\.git\\b|/\\.aws\\b|/\\.ht\\b).*HTTP.*

ignoreregex = 
`,

  'nginx-admin-scanners': `# fail2ban filter configuration for nginx admin scanner attacks
# Detects attempts to access admin panels and common paths

[Definition]

failregex = ^<HOST> -.*"(GET|POST|HEAD).*(/admin|/wp-admin|/wp-login|/administrator|/phpmyadmin|/mysql|/sql|/pma).*HTTP.*
            ^<HOST> -.*"(GET|POST|HEAD).*(/admin\\.php|/login\\.php|/wp-login\\.php|/administrator/index\\.php).*HTTP.*

ignoreregex = 
`,

  'nginx-robots-scan': `# fail2ban filter configuration for nginx robots.txt scanning
# Detects excessive robots.txt requests (often used for reconnaissance)

[Definition]

failregex = ^<HOST> -.*"(GET|HEAD).*/robots\\.txt.*HTTP.*

ignoreregex = 
`,

  'nginx-404': `# fail2ban filter configuration for nginx 404 errors
# Detects excessive 404 errors (often indicates scanning)

[Definition]

failregex = ^<HOST> -.*"GET.*HTTP/[0-9.]+" 404 .*

ignoreregex = 
`,

  'nginx-error-cycle': `# fail2ban filter configuration for nginx rewrite cycle errors
# Detects rewrite or internal redirection cycle errors

[Definition]

failregex = .*rewrite or internal redirection cycle.*client: <HOST>.*

ignoreregex = 

datepattern = {^LN-BEG}
`,
};

/**
 * Create filter file automatically based on filter name
 * @param {string} filterName
 * @returns {Promise<{ created: boolean, path: string, message: string }>}
 */
async function createFilterFile(filterName) {
  const filterPath = path.join(FAIL2BAN_FILTER_DIR, `${filterName}.conf`);
  
  // Check if already exists
  if (fs.existsSync(filterPath)) {
    return {
      created: false,
      path: filterPath,
      message: 'Filter file already exists',
    };
  }
  
  // Get template based on filter name
  const template = FILTER_TEMPLATES[filterName];
  
  if (!template) {
    return {
      created: false,
      path: filterPath,
      message: `No template available for filter: ${filterName}. Please create it manually.`,
    };
  }
  
  // Create filter file using helper script via sudo
  try {
    // Write to temp file first
    const tempFile = path.join(__dirname, `../tmp/${filterName}.conf.tmp`);
    const tempDir = path.dirname(tempFile);
    
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    fs.writeFileSync(tempFile, template, 'utf8');
    
    // Use helper script to create filter file
    // Use absolute path to match sudoers configuration
    const scriptPath = path.resolve(__dirname, '../scripts/create-filter-file.sh');
    
    // Verify script exists and is executable
    if (!fs.existsSync(scriptPath)) {
      throw new Error(`Helper script not found: ${scriptPath}`);
    }
    
    // Verify script is executable
    try {
      const stats = fs.statSync(scriptPath);
      if (!(stats.mode & parseInt('111', 8))) {
        console.warn(`[FILTER MANAGER] Script exists but may not be executable: ${scriptPath}`);
      }
    } catch (err) {
      console.warn(`[FILTER MANAGER] Could not check script permissions: ${err.message}`);
    }
    
    const args = [scriptPath, filterName, tempFile];
    
    console.log(`[FILTER MANAGER] Creating filter file: ${filterName}.conf`);
    console.log(`[FILTER MANAGER] Using script: ${scriptPath}`);
    console.log(`[FILTER MANAGER] Temp file: ${tempFile}`);
    
    const { stdout, stderr } = await execFileAsync(SUDO_PATH, args, {
      timeout: 10000,
      maxBuffer: 1024 * 1024,
      encoding: 'utf8',
    });
    
    // Log script output
    if (stdout) {
      console.log(`[FILTER MANAGER] Script stdout: ${stdout.trim()}`);
    }
    if (stderr) {
      console.warn(`[FILTER MANAGER] Script stderr: ${stderr.trim()}`);
    }
    
    // Verify file was created
    if (!fs.existsSync(filterPath)) {
      throw new Error(`Filter file was not created at ${filterPath} despite script success`);
    }
    
    // Clean up temp file
    try {
      fs.unlinkSync(tempFile);
    } catch (err) {
      // Ignore cleanup errors
      console.warn(`[FILTER MANAGER] Failed to cleanup temp file: ${err.message}`);
    }
    
    console.log(`[FILTER MANAGER] ✅ Successfully created filter file: ${filterPath}`);
    
    return {
      created: true,
      path: filterPath,
      message: `Filter file created successfully: ${filterPath}`,
    };
  } catch (err) {
    console.error(`[FILTER MANAGER] ❌ Failed to create filter file ${filterName}.conf:`, err);
    console.error(`[FILTER MANAGER] Error details:`, {
      message: err.message,
      code: err.code,
      signal: err.signal,
      stdout: err.stdout,
      stderr: err.stderr,
    });
    
    return {
      created: false,
      path: filterPath,
      message: `Failed to create filter file: ${err.message}. Check backend logs for details.`,
    };
  }
}

/**
 * Ensure filter file exists for a jail, create it if missing
 * @param {string} jailName
 * @returns {Promise<{ exists: boolean, created: boolean, filterName: string, message: string }>}
 */
async function ensureFilterExists(jailName) {
  console.log(`[FILTER MANAGER] ensureFilterExists called for jail: ${jailName}`);
  
  let filterName;
  try {
    filterName = await getFilterName(jailName);
    console.log(`[FILTER MANAGER] Determined filter name: ${filterName || 'null'} for jail: ${jailName}`);
  } catch (err) {
    console.error(`[FILTER MANAGER] Failed to get filter name for ${jailName}:`, err);
    return {
      exists: false,
      created: false,
      filterName: null,
      message: `Could not determine filter name for jail: ${jailName}. Error: ${err.message}`,
    };
  }
  
  if (!filterName) {
    console.warn(`[FILTER MANAGER] No filter name found for jail: ${jailName}`);
    return {
      exists: false,
      created: false,
      filterName: null,
      message: `Could not determine filter name for jail: ${jailName}`,
    };
  }
  
  const filterPath = path.join(FAIL2BAN_FILTER_DIR, `${filterName}.conf`);
  console.log(`[FILTER MANAGER] Checking if filter file exists: ${filterPath}`);
  
  if (filterFileExists(filterName)) {
    console.log(`[FILTER MANAGER] ✅ Filter file already exists: ${filterPath}`);
    
    // Skip validation - fail2ban will validate on restart
    // fail2ban-regex doesn't have --test-filter option in all versions
    
    return {
      exists: true,
      created: false,
      filterName,
      message: `Filter file already exists: ${filterName}.conf`,
    };
  }
  
  console.log(`[FILTER MANAGER] Filter file missing, attempting to create: ${filterPath}`);
  
  // Try to create filter file
  const result = await createFilterFile(filterName);
  
  console.log(`[FILTER MANAGER] Filter creation result:`, {
    created: result.created,
    message: result.message,
  });
  
  return {
    exists: result.created,
    created: result.created,
    filterName,
    message: result.message,
  };
}

/**
 * Enable jail by setting enabled=true in jail.local or jail.d override
 * @param {string} jailName - Jail name to enable
 * @returns {Promise<{success: boolean, configFile: string, message: string}>}
 */
async function enableJailInConfig(jailName) {
  const jailLocalPath = path.join(FAIL2BAN_CONFIG_DIR, 'jail.local');
  const jailDir = path.join(FAIL2BAN_CONFIG_DIR, 'jail.d');
  const jailOverrideFile = path.join(jailDir, `${jailName}.conf`);
  
  // Prefer jail.d/<jail-name>.conf for individual jail overrides
  // Fallback to jail.local if jail.d doesn't exist
  let targetFile;
  let targetContent = '';
  
  if (fs.existsSync(jailDir)) {
    targetFile = jailOverrideFile;
    // Check if file already exists
    if (fs.existsSync(targetFile)) {
      try {
        targetContent = fs.readFileSync(targetFile, 'utf8');
      } catch (err) {
        // File exists but can't read - will create new
        targetContent = '';
      }
    }
  } else {
    // Use jail.local
    targetFile = jailLocalPath;
    if (fs.existsSync(targetFile)) {
      try {
        targetContent = fs.readFileSync(targetFile, 'utf8');
      } catch (err) {
        targetContent = '';
      }
    }
  }
  
  // Check if jail section already exists in target file
  const jailSectionRegex = new RegExp(`\\[${jailName}\\]`, 'g');
  const hasJailSection = jailSectionRegex.test(targetContent);
  
  let newContent = '';
  if (hasJailSection) {
    // Update existing section - find and replace enabled line
    const lines = targetContent.split('\n');
    let inJailSection = false;
    let enabledFound = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      if (line.trim() === `[${jailName}]`) {
        inJailSection = true;
        newContent += line + '\n';
        continue;
      }
      
      if (inJailSection && line.trim().startsWith('[') && line.trim().endsWith(']')) {
        // Next section - add enabled if not found
        if (!enabledFound) {
          newContent += `enabled = true\n`;
        }
        inJailSection = false;
        enabledFound = false;
        newContent += line + '\n';
        continue;
      }
      
      if (inJailSection && line.trim().startsWith('enabled')) {
        // Replace existing enabled line
        newContent += `enabled = true\n`;
        enabledFound = true;
        continue;
      }
      
      newContent += line + '\n';
      
      // If we're past the jail section and haven't found enabled, add it before next section
      if (inJailSection && i === lines.length - 1 && !enabledFound) {
        newContent += `enabled = true\n`;
      }
    }
  } else {
    // Add new jail section
    if (targetContent && !targetContent.endsWith('\n')) {
      targetContent += '\n';
    }
    newContent = targetContent + `[${jailName}]\nenabled = true\n`;
  }
  
  // Write to temp file first
  const tempFile = path.join(__dirname, `../tmp/${jailName}-enable.conf.tmp`);
  const tempDir = path.dirname(tempFile);
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  fs.writeFileSync(tempFile, newContent, 'utf8');
  
  // Write to target location using helper script (for security)
  const SUDO_PATH = process.env.SUDO_PATH || '/usr/bin/sudo';
  const { execFile } = require('child_process');
  const { promisify } = require('util');
  const execFileAsync = promisify(execFile);
  
  const scriptPath = path.resolve(__dirname, '../../scripts/write-jail-config.sh');
  
  try {
    // Use helper script to write config file
    await execFileAsync(SUDO_PATH, [scriptPath, targetFile, tempFile], {
      timeout: 10000,
      maxBuffer: 1024 * 1024,
      encoding: 'utf8',
    });
    
    // Clean up temp file
    try {
      fs.unlinkSync(tempFile);
    } catch (cleanupErr) {
      // Ignore cleanup errors
    }
    
    return {
      success: true,
      configFile: targetFile,
      message: `Jail "${jailName}" enabled in ${targetFile}`,
    };
  } catch (err) {
    // Clean up temp file on error
    try {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    } catch (cleanupErr) {
      // Ignore cleanup errors
    }
    
    throw new Error(`Failed to write jail config: ${err.message}`);
  }
}

module.exports = {
  getJailConfig,
  getFilterName,
  filterFileExists,
  createFilterFile,
  ensureFilterExists,
  FILTER_TEMPLATES,
  enableJailInConfig,
};

