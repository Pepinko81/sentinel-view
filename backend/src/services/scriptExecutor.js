const { execFile } = require('child_process');
const { promisify } = require('util');
const config = require('../config/config');
const { getScriptPath, isScriptAllowed } = require('../config/scripts');

const execFileAsync = promisify(execFile);

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
    const { stdout, stderr } = await execFileAsync(
      command,
      commandArgs,
      {
        timeout,
        maxBuffer: 10 * 1024 * 1024, // 10MB max output
        encoding: 'utf8',
        // Preserve environment PATH for sudo (important for finding fail2ban-client)
        env: { ...process.env, PATH: process.env.PATH || '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin' },
      }
    );
    
    // Check stderr for fail2ban-client errors even on successful execution
    // In development/local environment, this is normal and not an error
    const combinedOutput = (stdout || '') + (stderr || '');
    if (stderr && (
      stderr.includes('fail2ban-client: command not found') ||
      stderr.includes('fail2ban-client command not found') ||
      (stderr.includes('command not found') && stderr.includes('fail2ban'))
    )) {
      // In development, fail2ban might not be installed - this is normal
      // Don't log as error, just return output (script might have partial data from nginx/system)
      // The parser will handle empty fail2ban data gracefully
      return { stdout, stderr };
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
      // In development/local environment, fail2ban might not be installed - this is normal
      // Return empty output with error in stderr for parser to handle gracefully
      // Don't log as error - parser will return safe defaults
      return { 
        stdout: errorStdout || '', 
        stderr: errorStderr || 'fail2ban-client command not found' 
      };
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

