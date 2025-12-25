/**
 * Parser utility functions for robust parsing
 * Handles errors, validates input, and provides anchor-based parsing
 */

/**
 * Safely parse output with error handling
 * @param {Function} parserFn - Parser function to execute
 * @param {string} output - Output string to parse
 * @param {object} defaults - Default values to return on error
 * @returns {object} - Parsed result with errors array
 */
function safeParse(parserFn, output, defaults = {}) {
  try {
    // Validate input - empty/null output is always an error
    if (output === null || output === undefined) {
      const errorMsg = 'Parser received null/undefined input - script execution failed';
      console.error(`[PARSER] ERROR: ${errorMsg}`);
      throw new Error(errorMsg);
    }
    
    // Convert to string if not already (handles numbers, objects, etc.)
    if (typeof output !== 'string') {
      console.warn(`[PARSER] Output is not a string (type: ${typeof output}), converting...`);
      output = String(output);
    }
    
    if (output.trim().length === 0) {
      const errorMsg = 'Parser received empty input - script returned no output';
      console.error(`[PARSER] ERROR: ${errorMsg}`);
      throw new Error(errorMsg);
    }
    
    // Execute parser
    const result = parserFn(output);
    
    // Ensure result has errors array
    if (!result.errors) {
      result.errors = [];
    }
    
    // Merge with defaults
    return { ...defaults, ...result };
  } catch (error) {
    console.error('Parser error:', error);
    return { 
      ...defaults, 
      errors: [error.message || 'Unknown parsing error'], 
      partial: true 
    };
  }
}

/**
 * Validate output string
 * @param {string} output - Output to validate
 * @returns {object} - { valid: boolean, error: string|null }
 */
function validateOutput(output) {
  if (!output) {
    return { valid: false, error: 'Output is null or undefined' };
  }
  
  if (typeof output !== 'string') {
    return { valid: false, error: 'Output is not a string' };
  }
  
  if (output.trim().length === 0) {
    return { valid: false, error: 'Output is empty' };
  }
  
  return { valid: true, error: null };
}

/**
 * Extract section between anchors
 * @param {string} output - Full output string
 * @param {string|RegExp} startAnchor - Start anchor (line must include this)
 * @param {string|RegExp} endAnchor - End anchor (optional, line must include this)
 * @returns {string[]} - Array of lines in the section
 */
function extractSection(output, startAnchor, endAnchor = null) {
  const lines = output.split('\n');
  
  // Find start index
  const startIdx = typeof startAnchor === 'string'
    ? lines.findIndex(l => l.includes(startAnchor))
    : lines.findIndex(l => startAnchor.test(l));
    
  if (startIdx === -1) {
    return [];
  }
  
  // Find end index
  let endIdx = lines.length;
  if (endAnchor) {
    const foundEndIdx = typeof endAnchor === 'string'
      ? lines.findIndex((l, i) => i > startIdx && l.includes(endAnchor))
      : lines.findIndex((l, i) => i > startIdx && endAnchor.test(l));
      
    if (foundEndIdx !== -1) {
      endIdx = foundEndIdx;
    }
  }
  
  return lines.slice(startIdx + 1, endIdx);
}

/**
 * Find value after anchor (not position-dependent)
 * Searches forward from anchor for a numeric value
 * @param {string[]} lines - Array of lines to search
 * @param {string|RegExp} anchor - Anchor text/pattern to find
 * @param {number} maxSearch - Maximum lines to search forward (default: 5)
 * @returns {number|null} - Found numeric value or null
 */
function findValueAfterAnchor(lines, anchor, maxSearch = 5) {
  // Find anchor line
  const anchorIdx = typeof anchor === 'string'
    ? lines.findIndex(l => l.includes(anchor))
    : lines.findIndex(l => anchor.test(l));
    
  if (anchorIdx === -1) {
    return null;
  }
  
  // Search forward for numeric value
  const searchEnd = Math.min(anchorIdx + maxSearch + 1, lines.length);
  
  for (let i = anchorIdx; i < searchEnd; i++) {
    const line = lines[i];
    
    // Try parsing entire line as number
    const num = parseInt(line.trim(), 10);
    if (!isNaN(num)) {
      return num;
    }
    
    // Try extracting number from line
    const match = line.match(/(\d+)/);
    if (match) {
      const extracted = parseInt(match[1], 10);
      if (!isNaN(extracted)) {
        return extracted;
      }
    }
  }
  
  return null;
}

/**
 * Extract numeric value from line using regex
 * @param {string} line - Line to extract from
 * @param {RegExp} pattern - Regex pattern to match
 * @returns {number|null} - Extracted number or null
 */
function extractNumber(line, pattern = /(\d+)/) {
  if (!line || typeof line !== 'string') {
    return null;
  }
  
  const match = line.match(pattern);
  if (match && match[1]) {
    const num = parseInt(match[1], 10);
    return isNaN(num) ? null : num;
  }
  
  return null;
}

/**
 * Detect fail2ban service errors in output
 * @param {string} output - Script output
 * @param {string} stderr - Standard error output
 * @returns {object} - { isError: boolean, errorType: string|null, message: string|null }
 */
function detectFail2banError(output, stderr = '') {
  const combined = (output || '') + '\n' + (stderr || '');
  const lower = combined.toLowerCase();
  
  // Check for common error indicators
  if (lower.includes('connection refused') || 
      lower.includes('failed to connect') ||
      lower.includes('cannot connect')) {
    return {
      isError: true,
      errorType: 'connection_error',
      message: 'fail2ban service connection refused'
    };
  }
  
  if (lower.includes('service not running') ||
      lower.includes('service is not running') ||
      lower.includes('not running') ||
      lower.includes('is fail2ban running') ||
      lower.includes('failed to access socket') ||
      lower.includes('socket path')) {
    return {
      isError: true,
      errorType: 'service_down',
      message: 'fail2ban service is not running'
    };
  }
  
  if (lower.includes('permission denied') ||
      lower.includes('access denied')) {
    return {
      isError: true,
      errorType: 'permission_error',
      message: 'Permission denied accessing fail2ban'
    };
  }
  
  // Check for command not found - this is always an error
  // Scripts should handle system binary availability, but if they report "not found",
  // it means the script itself failed (not backend's responsibility to check)
  if (lower.includes('command not found') ||
      lower.includes('fail2ban-client: command not found')) {
    return {
      isError: true,
      errorType: 'command_not_found',
      message: 'fail2ban-client command not found (reported by script)'
    };
  }
  
  // Check for empty output (might indicate service down)
  if (output && output.trim().length === 0 && stderr.trim().length === 0) {
    return {
      isError: true,
      errorType: 'empty_output',
      message: 'Empty output from fail2ban command'
    };
  }
  
  return {
    isError: false,
    errorType: null,
    message: null
  };
}

/**
 * Extract IP addresses from text
 * More robust than simple regex
 * @param {string} text - Text to extract IPs from
 * @returns {string[]} - Array of valid IP addresses
 */
function extractIPs(text) {
  if (!text || typeof text !== 'string') {
    return [];
  }
  
  // IPv4 regex - more strict
  const ipRegex = /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g;
  const matches = text.match(ipRegex) || [];
  
  // Validate IPs (filter out invalid ones)
  return matches.filter(ip => {
    const parts = ip.split('.');
    return parts.length === 4 && 
           parts.every(part => {
             const num = parseInt(part, 10);
             return !isNaN(num) && num >= 0 && num <= 255;
           });
  });
}

/**
 * Read recent fail2ban log entries for a specific jail
 * @param {string} jail - Jail name (optional)
 * @param {number} lines - Number of lines to read (default: 50)
 * @returns {Promise<string>} - Log content
 */
async function readFail2banLog(jail = null, lines = 50) {
  const fs = require('fs');
  const { execFile } = require('child_process');
  const { promisify } = require('util');
  const execFileAsync = promisify(execFile);
  const config = require('../../config/config');
  
  const SUDO_PATH = process.env.SUDO_PATH || '/usr/bin/sudo';
  const logPath = config.fail2ban.log;
  
  try {
    // Use tail to get last N lines
    const { stdout } = await execFileAsync(SUDO_PATH, ['tail', '-n', lines.toString(), logPath], {
      timeout: 5000,
      maxBuffer: 1024 * 1024,
      encoding: 'utf8',
    });
    
    if (jail) {
      // Filter lines related to this jail
      const jailLines = stdout.split('\n').filter(line => 
        line.toLowerCase().includes(jail.toLowerCase())
      );
      return jailLines.join('\n');
    }
    
    return stdout;
  } catch (err) {
    return `Error reading log: ${err.message}`;
  }
}

module.exports = {
  safeParse,
  validateOutput,
  extractSection,
  findValueAfterAnchor,
  extractNumber,
  detectFail2banError,
  extractIPs,
  readFail2banLog,
};

