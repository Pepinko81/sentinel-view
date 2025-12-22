const { detectFail2banError, extractIPs, validateOutput } = require('./parserUtils');

/**
 * Safe defaults for fail2ban status
 */
const defaultFail2banStatus = {
  status: 'unknown',
  jails: [],
  errors: [],
  partial: false,
};

/**
 * Safe defaults for jail status
 */
const defaultJailStatus = {
  name: null,
  enabled: false,
  bannedIPs: [],
  filter: null,
  maxRetry: null,
  banTime: null,
  findTime: null,
  errors: [],
  partial: false,
};

/**
 * Parse fail2ban-client status output
 * @param {string} output - Output from fail2ban-client status
 * @returns {object} - Parsed status with error tracking
 */
function parseFail2banStatus(output) {
  // Validate input
  const validation = validateOutput(output);
  if (!validation.valid) {
    return { ...defaultFail2banStatus, errors: [validation.error], partial: true };
  }
  
  // Check for fail2ban errors
  const errorCheck = detectFail2banError(output);
  if (errorCheck.isError) {
    return {
      ...defaultFail2banStatus,
      status: 'error',
      errors: [errorCheck.message],
      partial: true,
    };
  }
  
  const lines = output.split('\n').map(l => l.trim()).filter(l => l);
  const errors = [];
  
  const result = {
    ...defaultFail2banStatus,
    status: 'unknown',
    jails: [],
  };
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Parse status line - use anchor-based approach
    if (line.toLowerCase().includes('status')) {
      const match = line.match(/status[:\s]+(.+)/i);
      if (match) {
        result.status = match[1].trim().toLowerCase();
      }
    }
    
    // Parse jail list - robust parsing for various formats
    // Handles: "Jail list:\tnginx-404, nginx-admin-scanners"
    // Handles: "- Jail list:\tnginx-404, nginx-admin-scanners"
    // Handles: "`- Jail list:\tnginx-404, nginx-admin-scanners"
    // Handles: "|  Jail list: nginx-404, nginx-admin-scanners"
    if (line.toLowerCase().includes('jail list') || line.toLowerCase().includes('number of jail')) {
      if (line.toLowerCase().includes('jail list')) {
        // Remove ALL leading symbols: backticks, dashes, pipes, whitespace, tabs
        const cleaned = line.replace(/^[`|\-|\s\t]+/, '').trim();
        const match = cleaned.match(/jail\s*list[:\s\t]+(.+)/i);
        
        if (match && match[1]) {
          const jails = match[1]
            .split(',')
            .map(j => j.trim())
            .filter(j => j && j !== '' && j !== '-');
          
          // Validate against "Number of jail" if present
          const numberMatch = output.match(/number\s+of\s+jail[:\s\t]+(\d+)/i);
          if (numberMatch) {
            const expectedCount = parseInt(numberMatch[1], 10);
            if (jails.length !== expectedCount) {
              const errorMsg = `Jail count mismatch: expected ${expectedCount}, parsed ${jails.length}. Line: ${JSON.stringify(line)}`;
              if (process.env.NODE_ENV === 'production') {
                throw new Error(errorMsg);
              } else {
                errors.push(errorMsg);
                console.warn(`[FAIL2BAN PARSER] ${errorMsg}`);
              }
            }
          }
          
          if (jails.length === 0) {
            const errorMsg = `Jail list parsing failed: extracted 0 jails from non-empty line: ${JSON.stringify(line)}`;
            if (process.env.NODE_ENV === 'production') {
              throw new Error(errorMsg);
            } else {
              errors.push(errorMsg);
              console.warn(`[FAIL2BAN PARSER] ${errorMsg}`);
            }
          } else {
            result.jails = jails;
            // Log for debugging (only in development)
            if (process.env.NODE_ENV === 'development') {
              console.log(`[FAIL2BAN PARSER] ✅ Extracted ${jails.length} jails: ${jails.join(', ')}`);
            }
          }
        } else {
          const errorMsg = `Jail list parsing failed: regex did not match line: ${JSON.stringify(line)}`;
          if (process.env.NODE_ENV === 'production') {
            throw new Error(errorMsg);
          } else {
            errors.push(errorMsg);
            console.warn(`[FAIL2BAN PARSER] ${errorMsg}`);
          }
        }
      }
    }
  }
  
  // If no jails found but status is OK, might be empty configuration
  if (result.status === 'ok' && result.jails.length === 0) {
    // This is valid - no jails configured
    result.status = 'ok';
  }
  
  result.errors = errors;
  return result;
}

/**
 * Parse fail2ban-client status <jail> output
 * @param {string} output - Output from fail2ban-client status <jail>
 * @param {string} jailName - Name of the jail
 * @returns {object} - Parsed jail details with error tracking
 */
function parseJailStatus(output, jailName) {
  // Validate input
  const validation = validateOutput(output);
  if (!validation.valid) {
    return { 
      ...defaultJailStatus, 
      name: jailName,
      errors: [validation.error], 
      partial: true 
    };
  }
  
  // Check for fail2ban errors
  const errorCheck = detectFail2banError(output);
  if (errorCheck.isError) {
    return {
      ...defaultJailStatus,
      name: jailName,
      enabled: false,
      errors: [errorCheck.message],
      partial: true,
    };
  }
  
  const lines = output.split('\n').map(l => l.trim()).filter(l => l);
  const errors = [];
  
  const result = {
    ...defaultJailStatus,
    name: jailName,
    enabled: false,
    bannedIPs: [],
  };
  
  // Track if we found banned IP section
  let inBannedIPSection = false;
  let ipLines = [];
  
  for (const line of lines) {
    // Parse enabled status - multiple indicators
    if (line.toLowerCase().includes('currently banned')) {
      const match = line.match(/currently\s+banned[:\s]+(\d+)/i);
      if (match) {
        result.enabled = true;
      } else {
        // Just presence of this line might indicate enabled
        result.enabled = true;
      }
    }
    
    // Parse filter
    if (line.toLowerCase().startsWith('filter')) {
      const match = line.match(/filter[:\s]+(.+)/i);
      if (match) {
        result.filter = match[1].trim();
        // If filter exists, jail is likely enabled
        if (!result.enabled) {
          result.enabled = true;
        }
      }
    }
    
    // Parse max retry - flexible matching
    if (line.toLowerCase().includes('max') && line.toLowerCase().includes('retry')) {
      const match = line.match(/max\s*retry[:\s]+(\d+)/i);
      if (match) {
        result.maxRetry = parseInt(match[1], 10);
      }
    }
    
    // Parse ban time - flexible matching
    if (line.toLowerCase().includes('ban') && line.toLowerCase().includes('time')) {
      const match = line.match(/ban\s*time[:\s]+(\d+)/i);
      if (match) {
        result.banTime = parseInt(match[1], 10);
      }
    }
    
    // Parse find time - flexible matching
    if (line.toLowerCase().includes('find') && line.toLowerCase().includes('time')) {
      const match = line.match(/find\s*time[:\s]+(\d+)/i);
      if (match) {
        result.findTime = parseInt(match[1], 10);
      }
    }
    
    // Parse banned IPs - improved multiline handling
    if (line.toLowerCase().includes('banned ip list') || 
        line.toLowerCase().includes('currently banned')) {
      inBannedIPSection = true;
      
      // Extract IPs from same line
      const sameLineIPs = extractIPs(line);
      if (sameLineIPs.length > 0) {
        ipLines.push(...sameLineIPs);
      }
      
      // Continue collecting IPs from following lines
      const lineIdx = lines.indexOf(line);
      for (let j = lineIdx + 1; j < Math.min(lineIdx + 10, lines.length); j++) {
        const nextLine = lines[j];
        // Stop if we hit a new section (starts with capital letter or colon)
        if (nextLine && /^[A-Z]/.test(nextLine) && nextLine.includes(':')) {
          break;
        }
        const nextLineIPs = extractIPs(nextLine);
        if (nextLineIPs.length > 0) {
          ipLines.push(...nextLineIPs);
        } else if (nextLine.trim() === '' || nextLine.includes('---')) {
          // Empty line or separator indicates end of IP list
          break;
        }
      }
    }
  }
  
  // Deduplicate IPs and assign
  result.bannedIPs = [...new Set(ipLines)];
  
  // If we have banned IPs, jail is definitely enabled
  if (result.bannedIPs.length > 0) {
    result.enabled = true;
  }
  
  // If no banned IPs found but jail exists, it might still be enabled
  // Check for other indicators
  if (result.filter && !result.enabled) {
    // If filter exists, assume enabled unless explicitly disabled
    result.enabled = true;
  }
  
  result.errors = errors;
  return result;
}

/**
 * Extract jail names from status output
 * @param {string} output - Output from fail2ban-client status
 * @returns {string[]} - Array of jail names
 */
function extractJailNames(output) {
  try {
    const parsed = parseFail2banStatus(output);
    return parsed.jails || [];
  } catch (error) {
    console.error('Error extracting jail names:', error);
    return [];
  }
}

module.exports = {
  parseFail2banStatus,
  parseJailStatus,
  extractJailNames,
  defaultFail2banStatus,
  defaultJailStatus,
};
