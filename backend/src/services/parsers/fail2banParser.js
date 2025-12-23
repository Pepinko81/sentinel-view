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
  bannedCount: 0, // Keep for backward compatibility
  currentlyBanned: 0, // Runtime active bans (source of truth for UI)
  totalBanned: undefined, // Historical total (optional, informational)
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
  
  // Track banned counts: "Currently banned" (runtime) and "Total banned" (historical)
  let currentlyBannedCount = 0;
  let totalBannedCount = null; // Optional, informational only
  let bannedIPListLine = null;
  let sawCurrentlyLine = false;
  let parsedCurrentlyLine = false;
  
  for (const line of lines) {
    // Parse "Currently banned" - THIS IS THE SOURCE OF TRUTH for active bans
    // Format: "Currently banned:\t1" or "Currently banned: 1"
    if (line.toLowerCase().includes('currently banned')) {
      sawCurrentlyLine = true;
      // Remove leading symbols (|, -, `, spaces, tabs)
      const cleaned = line.replace(/^[`|\-|\s\t]+/, '').trim();
      // Match: "Currently banned:" followed by tab/space/colon and number
      const match = cleaned.match(/currently\s+banned[:\s\t]+(\d+)/i);
      if (match) {
        currentlyBannedCount = parseInt(match[1], 10);
        parsedCurrentlyLine = true;
        result.enabled = true; // If there are banned IPs, jail is enabled
        if (process.env.NODE_ENV === 'development') {
          console.log(`[JAIL PARSER] ${jailName}: Currently banned = ${currentlyBannedCount}`);
        }
      }
    }
    
    // Parse "Total banned" - informational/historical count (optional)
    // Format: "Total banned:\t11" or "Total banned: 11"
    if (line.toLowerCase().includes('total banned') && !line.toLowerCase().includes('currently')) {
      const cleaned = line.replace(/^[`|\-|\s\t]+/, '').trim();
      const match = cleaned.match(/total\s+banned[:\s\t]+(\d+)/i);
      if (match) {
        totalBannedCount = parseInt(match[1], 10);
        if (process.env.NODE_ENV === 'development') {
          console.log(`[JAIL PARSER] ${jailName}: Total banned = ${totalBannedCount}`);
        }
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
    
    // Parse "Banned IP list" - extract IP addresses
    // Format: "Banned IP list:\t66.249.79.1" or "`- Banned IP list: 66.249.79.1"
    if (line.toLowerCase().includes('banned ip list')) {
      bannedIPListLine = line;
    }
  }
  
  // Parse banned IP list if found
  if (bannedIPListLine) {
    // Remove leading symbols (|, -, `, spaces, tabs)
    const cleaned = bannedIPListLine.replace(/^[`|\-|\s\t]+/, '').trim();
    // Match: "Banned IP list:" followed by tab/space/colon and IPs (whitespace-separated)
    const match = cleaned.match(/banned\s+ip\s+list[:\s\t]+(.+)/i);
    
    if (match && match[1]) {
      const ipListStr = match[1].trim();
      
      // Extract IPs - handle whitespace-separated list (spaces/tabs)
      if (ipListStr && ipListStr.length > 0) {
        const ipParts = ipListStr.split(/\s+/);
        const extractedIPs = [];
        
        for (const part of ipParts) {
          const ips = extractIPs(part.trim());
          extractedIPs.push(...ips);
        }
        
        result.bannedIPs = [...new Set(extractedIPs)];
        
        if (process.env.NODE_ENV === 'development') {
          console.log(`[JAIL PARSER] ${jailName}: Extracted ${result.bannedIPs.length} IPs from Banned IP list`);
        }
      }
    }
  }
  
  // If we saw a "Currently banned" line but failed to parse it, this is a hard error
  if (sawCurrentlyLine && !parsedCurrentlyLine) {
    throw new Error(`Failed to parse "Currently banned" line for jail ${jailName}`);
  }
  
  // CRITICAL: Use "Currently banned" as source of truth
  // If "Currently banned" > 0, we MUST have a count > 0
  // Even if IP list parsing failed, we know there are banned IPs
  if (currentlyBannedCount > 0) {
    result.enabled = true;
    
    // If we couldn't parse IPs but count > 0, log warning but keep count
    if (result.bannedIPs.length === 0 && currentlyBannedCount > 0) {
      if (process.env.NODE_ENV === 'development') {
        console.warn(`[JAIL PARSER] ${jailName}: Currently banned = ${currentlyBannedCount} but parsed 0 IPs. IP list may be empty or parsing failed.`);
      }
      // Don't set bannedIPs to empty - keep it as [] but count is correct
    }
    
    // Validate: parsed IP count should match "Currently banned" (if IPs were parsed)
    if (result.bannedIPs.length > 0 && result.bannedIPs.length !== currentlyBannedCount) {
      if (process.env.NODE_ENV === 'development') {
        console.warn(`[JAIL PARSER] ${jailName}: IP count mismatch - Currently banned: ${currentlyBannedCount}, Parsed IPs: ${result.bannedIPs.length}`);
      }
    }
  } else {
    // If "Currently banned" = 0, there should be no IPs
    result.bannedIPs = [];
  }
  
  // If filter exists, jail is likely enabled
  if (result.filter && !result.enabled) {
    result.enabled = true;
  }
  
  // Add banned counts to result (for API response)
  // currently_banned is the ONLY value used in UI tables
  // total_banned is informational and optional
  result.bannedCount = currentlyBannedCount; // Keep for backward compatibility
  result.currentlyBanned = currentlyBannedCount;
  result.totalBanned = totalBannedCount !== null ? totalBannedCount : undefined; // Optional
  
  result.errors = errors;
  return result;
}

/**
 * Parse output from test-fail2ban.sh
 * This script prints multiple blocks:
 *   JAIL: <name>
 *   ... fail2ban-client status <jail> output ...
 *
 * We reuse parseJailStatus for each block.
 *
 * @param {string} output
 * @returns {Record<string, object>} - Map jailName -> parsed jail status
 */
function parseTestFail2ban(output) {
  const validation = validateOutput(output);
  if (!validation.valid) {
    throw new Error(validation.error || 'Invalid test-fail2ban output');
  }

  const errorCheck = detectFail2banError(output);
  if (errorCheck.isError) {
    throw new Error(errorCheck.message || 'fail2ban error in test-fail2ban output');
  }

  const lines = output.split('\n');
  const jailBlocks = {};
  let currentJail = null;
  let buffer = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const jailMatch = line.match(/^JAIL:\s*(\S+)/);
    if (jailMatch) {
      // Flush previous block
      if (currentJail && buffer.length > 0) {
        const blockText = buffer.join('\n');
        const parsed = parseJailStatus(blockText, currentJail);
        jailBlocks[currentJail] = parsed;
      }
      currentJail = jailMatch[1];
      buffer = [];
    } else if (currentJail) {
      buffer.push(rawLine);
    }
  }

  // Flush last block
  if (currentJail && buffer.length > 0) {
    const blockText = buffer.join('\n');
    const parsed = parseJailStatus(blockText, currentJail);
    jailBlocks[currentJail] = parsed;
  }

  return jailBlocks;
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
  parseTestFail2ban,
  extractJailNames,
  defaultFail2banStatus,
  defaultJailStatus,
};
