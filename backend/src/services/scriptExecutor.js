const { execFile } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs = require('fs');
const config = require('../config/config');
const { getScriptPath, isScriptAllowed } = require('../config/scripts');

const execFileAsync = promisify(execFile);

// Detect fail2ban-client path at startup
const FAIL2BAN_CLIENT_PATHS = ['/usr/bin/fail2ban-client', '/usr/sbin/fail2ban-client'];
let fail2banClientPath = null;
let fail2banClientDir = null;

// Detect at module load
for (const clientPath of FAIL2BAN_CLIENT_PATHS) {
  try {
    if (fs.existsSync(clientPath)) {
      // Check if executable
      fs.accessSync(clientPath, fs.constants.X_OK);
      fail2banClientPath = clientPath;
      fail2banClientDir = path.dirname(clientPath);
      break;
    }
  } catch (err) {
    // Path exists but not executable, continue searching
    continue;
  }
}

// Log detection result
if (fail2banClientPath) {
  console.log(`[SCRIPT EXECUTOR] fail2ban-client detected at: ${fail2banClientPath}`);
} else if (config.nodeEnv === 'production') {
  console.error(`[SCRIPT EXECUTOR] CRITICAL: fail2ban-client not found at expected paths: ${FAIL2BAN_CLIENT_PATHS.join(', ')}`);
} else {
  console.log(`[SCRIPT EXECUTOR] fail2ban-client not found (dev mode - continuing)`);
}

/**
 * Execute a whitelisted script securely
 * @param {string} scriptName - Name of script (must be in whitelist)
 * @param {string[]} args - Arguments to pass to script
 * @param {object} options - Execution options
 * @returns {Promise<{stdout: string, stderr: string}>} - Script output
 */
async function executeScript(scriptName, args = [], options = {}) {
  // Get script path and validate
  const scriptPath = getScriptPath(scriptName);
  
  if (!scriptPath) {
    throw new Error(`Script "${scriptName}" is not in the whitelist`);
  }
  
  // Double-check path is allowed
  if (!isScriptAllowed(scriptPath)) {
    throw new Error(`Script path "${scriptPath}" is not allowed`);
  }
  
  // Validate arguments - no shell injection possible
  const safeArgs = args.map(arg => {
    if (typeof arg !== 'string') {
      throw new Error('Arguments must be strings');
    }
    // Additional validation can be added here if needed
    return arg;
  });
  
  // Build command - scripts are executed with sudo (if configured in sudoers)
  // The scripts themselves use sudo internally for fail2ban commands
  // Sudoers allows: sentinel_user ALL=(ALL) NOPASSWD: /path/to/scripts/*.sh
  const command = 'sudo';
  const commandArgs = [scriptPath, ...safeArgs];
  
  const timeout = options.timeout || config.scriptTimeout;
  
  try {
    // Build environment with proper PATH
    const basePath = process.env.PATH || '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';
    let envPath = basePath;
    
    // Add fail2ban directory to PATH if detected and not already present
    if (fail2banClientDir && !envPath.includes(fail2banClientDir)) {
      envPath = `${fail2banClientDir}:${envPath}`;
    }
    
    const env = {
      ...process.env,
      PATH: envPath,
    };
    
    const { stdout, stderr } = await execFileAsync(
      command,
      commandArgs,
      {
        timeout,
        maxBuffer: 10 * 1024 * 1024, // 10MB max output
        encoding: 'utf8',
        env,
      }
    );
    
    // Check for fail2ban-client execution success
    if (stdout && stdout.includes('Jail list:') && !stderr.includes('fail2ban-client')) {
      if (config.nodeEnv === 'development') {
        console.log('[SCRIPT EXECUTOR] fail2ban-client executed successfully via sudo');
      }
    }
    
    // Check stderr for fail2ban-client errors
    const combinedOutput = (stdout || '') + (stderr || '');
    if (stderr && (
      stderr.includes('fail2ban-client: command not found') ||
      stderr.includes('fail2ban-client command not found') ||
      (stderr.includes('command not found') && stderr.includes('fail2ban'))
    )) {
      // In production, this is a critical error
      if (config.nodeEnv === 'production') {
        throw new Error('CRITICAL: fail2ban-client not found in production. Backend cannot function.');
      } else {
        // Development: log but continue
        console.log('[SCRIPT EXECUTOR] fail2ban-client not found (dev mode - continuing)');
        return { stdout, stderr };
      }
    }
    
    return { stdout, stderr };
  } catch (error) {
    // Handle timeout
    if (error.code === 'ETIMEDOUT') {
      throw new Error(`Script execution timed out after ${timeout}ms`);
    }
    
    // Handle command not found
    if (error.code === 'ENOENT') {
      throw new Error(`Script not found: ${scriptPath}`);
    }
    
    // Check stderr for fail2ban-client not found errors
    const errorStderr = error.stderr || '';
    const errorStdout = error.stdout || '';
    const combinedError = errorStderr + errorStdout;
    
    if (combinedError.includes('fail2ban-client: command not found') ||
        combinedError.includes('fail2ban-client command not found') ||
        (combinedError.includes('command not found') && combinedError.includes('fail2ban'))) {
      // In production, this is a critical error
      if (config.nodeEnv === 'production') {
        throw new Error('CRITICAL: fail2ban-client not found in production. Backend cannot function.');
      } else {
        // Development: return empty output
        console.log('[SCRIPT EXECUTOR] fail2ban-client not found (dev mode - returning empty output)');
        return { 
          stdout: errorStdout || '', 
          stderr: errorStderr || 'fail2ban-client command not found' 
        };
      }
    }
    
    // Return stderr for non-zero exit codes (some scripts use exit codes for status)
    if (error.stdout || error.stderr) {
      return {
        stdout: error.stdout || '',
        stderr: error.stderr || error.message,
      };
    }
    
    throw error;
  }
}

module.exports = {
  executeScript,
};

