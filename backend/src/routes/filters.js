const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const { execFile } = require('child_process');
const { restartFail2ban } = require('../services/fail2banControl');
const { discoverConfiguredJails } = require('../services/jailDiscovery');
const { getJailConfig } = require('../services/filterManager');
const { runFail2banAction } = require('../services/fail2banControl');
const { API_VERSION } = require('../config/api');

const execFileAsync = promisify(execFile);

// Absolute paths
const SUDO_PATH = process.env.SUDO_PATH || '/usr/bin/sudo';
const FAIL2BAN_CONFIG_DIR = process.env.FAIL2BAN_CONFIG_DIR || '/etc/fail2ban';
const FAIL2BAN_FILTER_DIR = path.join(FAIL2BAN_CONFIG_DIR, 'filter.d');

/**
 * Validate filter name (letters, numbers, dash only)
 */
function isValidFilterName(name) {
  if (!name || typeof name !== 'string') {
    return false;
  }
  // Only letters, numbers, and dash allowed
  return /^[a-zA-Z0-9-]+$/.test(name);
}

/**
 * POST /api/filters/create
 * Create a new fail2ban filter file
 * Payload:
 * {
 *   name: string (required),
 *   failregex: string (required),
 *   ignoreregex?: string (optional)
 * }
 */
router.post('/create', async (req, res, next) => {
  try {
    const { name, failregex, ignoreregex } = req.body;

    // Validate required fields
    if (!name || typeof name !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Filter name is required',
      });
    }

    if (!failregex || typeof failregex !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'failregex pattern is required',
      });
    }

    // Validate filter name format (letters, numbers, dash only)
    if (!isValidFilterName(name)) {
      return res.status(400).json({
        success: false,
        error: `Invalid filter name: "${name}". Filter names must contain only letters, numbers, and dashes.`,
      });
    }

    console.log(`[FILTER CREATE] Creating filter: ${name}`);

    // Check if filter file already exists (we'll append to it instead of erroring)
    const filterPath = path.join(FAIL2BAN_FILTER_DIR, `${name}.conf`);

    // Check if filter exists and read existing content
    let existingContent = '';
    let hasExistingFile = false;
    
    try {
      if (fs.existsSync(filterPath)) {
        existingContent = fs.readFileSync(filterPath, 'utf8');
        hasExistingFile = true;
      } else {
        // Try with sudo
        try {
          const { stdout } = await execFileAsync(SUDO_PATH, ['cat', filterPath], { timeout: 5000 });
          existingContent = stdout || '';
          hasExistingFile = true;
        } catch (readErr) {
          // File doesn't exist, will create new
          hasExistingFile = false;
        }
      }
    } catch (readErr) {
      // File doesn't exist or can't be read, will create new
      hasExistingFile = false;
    }

    // Prepare filter file content
    let filterContent = '';
    
    if (hasExistingFile && existingContent) {
      // Append to existing filter file
      filterContent = existingContent.trim();
      
      // Check if [Definition] section exists
      if (!filterContent.includes('[Definition]')) {
        filterContent = `[Definition]\n${filterContent}`;
      }
      
      // Fail2ban supports multiple failregex patterns using continuation lines (indented)
      // Find the last failregex line and append to it
      const lines = filterContent.split('\n');
      let lastFailregexIndex = -1;
      for (let i = lines.length - 1; i >= 0; i--) {
        if (lines[i].trim().startsWith('failregex')) {
          lastFailregexIndex = i;
          break;
        }
      }
      
      if (lastFailregexIndex >= 0) {
        // Append as continuation line (indented with spaces)
        // Find where to insert (after last failregex or its continuations)
        let insertIndex = lastFailregexIndex + 1;
        while (insertIndex < lines.length && 
               (lines[insertIndex].trim().startsWith('^') || 
                lines[insertIndex].trim().startsWith('\\') ||
                /^\s+/.test(lines[insertIndex]))) {
          insertIndex++;
        }
        lines.splice(insertIndex, 0, '            ' + failregex);
        filterContent = lines.join('\n');
      } else {
        // No existing failregex, add new one
        filterContent += `\nfailregex = ${failregex}`;
      }
      
      // Update ignoreregex if provided (only one ignoreregex allowed, replace if exists)
      if (ignoreregex && ignoreregex.trim()) {
        // Remove all existing ignoreregex lines
        filterContent = filterContent.replace(/^ignoreregex\s*=.*$/gm, '');
        // Add new ignoreregex at the end
        filterContent += `\nignoreregex = ${ignoreregex.trim()}`;
      }
      
      console.log(`[FILTER CREATE] Appending to existing filter: ${name}`);
    } else {
      // Create new filter file
      filterContent = `[Definition]\n`;
      filterContent += `failregex = ${failregex}\n`;
      
      if (ignoreregex && ignoreregex.trim()) {
        filterContent += `ignoreregex = ${ignoreregex.trim()}\n`;
      }
      
      console.log(`[FILTER CREATE] Creating new filter: ${name}`);
    }

    // Write filter file using helper script (for security)
    const scriptPath = path.resolve(__dirname, '../../scripts/create-filter-file.sh');
    
    // Create temp file with filter content
    const tempFile = path.join(__dirname, `../tmp/${name}.conf.tmp`);
    const tempDir = path.dirname(tempFile);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    fs.writeFileSync(tempFile, filterContent, 'utf8');
    
    try {
      // Pass temp file path to script
      const { stdout, stderr } = await execFileAsync(
        SUDO_PATH,
        [scriptPath, name, tempFile],
        {
          timeout: 10000,
          maxBuffer: 1024 * 1024,
          encoding: 'utf8',
        }
      );
      
      // Clean up temp file after successful creation
      try {
        fs.unlinkSync(tempFile);
      } catch (cleanupErr) {
        console.warn(`[FILTER CREATE] ⚠️ Failed to cleanup temp file: ${cleanupErr.message}`);
      }
      
      if (stderr && !stdout) {
        throw new Error(`Script error: ${stderr}`);
      }
      
      console.log(`[FILTER CREATE] ✅ Filter file created: ${filterPath}`);
    } catch (writeErr) {
      // Clean up temp file on error
      try {
        if (fs.existsSync(tempFile)) {
          fs.unlinkSync(tempFile);
        }
      } catch (cleanupErr) {
        // Ignore cleanup errors
      }
      
      // Check if error is because file already exists
      if (writeErr.message && writeErr.message.includes('already exists')) {
        return res.status(409).json({
          success: false,
          error: 'Filter already exists',
          details: {
            filterName: name,
            filterPath: filterPath,
            suggestion: 'Use a different name or modify the existing filter manually.',
          },
        });
      }
      
      throw new Error(`Failed to write filter file: ${writeErr.message}`);
    }

    // Restart fail2ban service (mandatory - filters are only loaded at service boot)
    console.log(`[FILTER CREATE] Restarting fail2ban service...`);
    try {
      await restartFail2ban();
      console.log(`[FILTER CREATE] ✅ Fail2ban service restarted`);
      
      // Wait a bit longer for fail2ban to fully start after restart
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (restartErr) {
      console.error(`[FILTER CREATE] ❌ Failed to restart fail2ban: ${restartErr.message}`);
      // Filter was created, but restart failed - return warning
      return res.json({
        success: true,
        filter: name,
        filterPath: filterPath,
        message: `Filter "${name}" created successfully, but failed to restart fail2ban. Please restart manually: sudo systemctl restart fail2ban`,
        warning: restartErr.message,
      });
    }

    // After restart, check if a jail with this filter name exists and is configured with enabled=true
    // If so, automatically start it
    let jailAutoStarted = false;
    try {
      const configuredJails = await discoverConfiguredJails();
      const jailsList = configuredJails.jails || [];
      
      console.log(`[FILTER CREATE] Checking for jail with name "${name}" in ${jailsList.length} configured jails...`);
      
      // Check if there's a jail with the same name as the filter
      if (jailsList.includes(name)) {
        console.log(`[FILTER CREATE] ✅ Found jail "${name}" in configured jails, checking configuration...`);
        const jailConfig = await getJailConfig(name);
        
        if (jailConfig) {
          console.log(`[FILTER CREATE] Jail config found in ${jailConfig.configFile}`);
          console.log(`[FILTER CREATE] Jail config: enabled=${jailConfig.config.enabled}, filter=${jailConfig.config.filter || 'N/A'}`);
        }
        
        // Always auto-start jail after filter creation (regardless of enabled setting)
        // This allows users to create filters and immediately use them
        console.log(`[FILTER CREATE] Auto-starting jail "${name}" after filter creation...`);
        try {
          // First verify fail2ban is running
          let fail2banActive = false;
          try {
            const { stdout: statusOutput } = await execFileAsync(SUDO_PATH, ['systemctl', 'is-active', 'fail2ban'], { timeout: 5000 });
            fail2banActive = statusOutput.trim() === 'active';
            if (!fail2banActive) {
              console.warn(`[FILTER CREATE] ⚠️ Fail2ban service is not active (status: ${statusOutput.trim()}), cannot start jail`);
              console.warn(`[FILTER CREATE] 💡 Tip: Start fail2ban service: sudo systemctl start fail2ban`);
            } else {
              console.log(`[FILTER CREATE] ✅ Fail2ban service is active`);
            }
          } catch (statusErr) {
            console.warn(`[FILTER CREATE] ⚠️ Could not check fail2ban status: ${statusErr.message}`);
            // Assume fail2ban is running and try to start jail anyway
            fail2banActive = true;
          }
          
          if (fail2banActive) {
            // Try to start jail
            try {
              const startResult = await runFail2banAction('start', name, true); // ignoreNOK = true (idempotent)
              
              if (startResult.nok) {
                console.warn(`[FILTER CREATE] ⚠️ Jail start returned NOK - jail may not have started`);
                console.warn(`[FILTER CREATE] stdout: ${startResult.stdout || '(empty)'}`);
                console.warn(`[FILTER CREATE] stderr: ${startResult.stderr || '(empty)'}`);
              }
              
              // Verify jail is actually started by checking active jails list
              await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds for jail to start
              const { getGlobalFail2banStatus } = require('../services/fail2banControl');
              const globalStatus = await getGlobalFail2banStatus();
              const activeJails = globalStatus.jails || [];
              
              if (activeJails.includes(name)) {
                jailAutoStarted = true;
                console.log(`[FILTER CREATE] ✅ Jail "${name}" auto-started and verified as active`);
              } else {
                console.warn(`[FILTER CREATE] ⚠️ Jail "${name}" start command executed but jail is not in active list`);
                console.warn(`[FILTER CREATE] Active jails: ${activeJails.join(', ')}`);
                
                // Try to get more info about why jail didn't start
                try {
                  const { stdout: jailStatus } = await execFileAsync(SUDO_PATH, [FAIL2BAN_CLIENT_PATH, 'status', name], { timeout: 5000 });
                  console.warn(`[FILTER CREATE] Jail status output: ${jailStatus.substring(0, 200)}`);
                } catch (statusErr) {
                  console.warn(`[FILTER CREATE] Could not get jail status: ${statusErr.message}`);
                }
                
                // Check if there's an error in fail2ban logs
                console.warn(`[FILTER CREATE] 💡 Tip: Check fail2ban logs: sudo tail -50 /var/log/fail2ban.log | grep "${name}"`);
                console.warn(`[FILTER CREATE] 💡 Tip: Jail may need 'enabled = true' in config or may have configuration errors`);
              }
            } catch (startErr) {
              console.warn(`[FILTER CREATE] ⚠️ Failed to auto-start jail "${name}": ${startErr.message}`);
              // Don't fail the request - filter was created successfully
            }
          }
        } catch (err) {
          console.warn(`[FILTER CREATE] ⚠️ Error during jail auto-start process: ${err.message}`);
          // Don't fail the request - filter was created successfully
        }
      } else {
        console.log(`[FILTER CREATE] Jail "${name}" not found in configured jails list (${jailsList.length} jails)`);
      }
    } catch (jailCheckErr) {
      console.warn(`[FILTER CREATE] Could not check/start jail: ${jailCheckErr.message}`);
      console.warn(`[FILTER CREATE] Error stack:`, jailCheckErr.stack);
    }

    res.setHeader('X-API-Version', API_VERSION);
    return res.json({
      success: true,
      filter: name,
      filterPath: filterPath,
      message: jailAutoStarted 
        ? `Filter "${name}" created, fail2ban restarted, and jail "${name}" auto-started successfully`
        : `Filter "${name}" created and fail2ban restarted successfully`,
      jailAutoStarted: jailAutoStarted,
    });
  } catch (err) {
    console.error(`[FILTER CREATE] ❌ Error creating filter:`, err);
    next(err);
  }
});

module.exports = router;

