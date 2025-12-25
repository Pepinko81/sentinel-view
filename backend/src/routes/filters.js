const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const { execFile } = require('child_process');
const { restartFail2ban } = require('../services/fail2banControl');
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
      
      // Append new failregex (fail2ban supports multiple failregex lines)
      if (filterContent.includes('failregex =')) {
        // Add new failregex line
        filterContent += `\nfailregex = ${failregex}`;
      } else {
        // Add first failregex
        filterContent += `\nfailregex = ${failregex}`;
      }
      
      // Update ignoreregex if provided
      if (ignoreregex && ignoreregex.trim()) {
        // Remove old ignoreregex if exists
        filterContent = filterContent.replace(/^ignoreregex\s*=.*$/gm, '');
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

    res.setHeader('X-API-Version', API_VERSION);
    return res.json({
      success: true,
      filter: name,
      filterPath: filterPath,
      message: `Filter "${name}" created and fail2ban restarted successfully`,
    });
  } catch (err) {
    console.error(`[FILTER CREATE] ❌ Error creating filter:`, err);
    next(err);
  }
});

module.exports = router;

