/**
 * Parse fail2ban-client status output
 * @param {string} output - Output from fail2ban-client status
 * @returns {object} - Parsed status
 */
function parseFail2banStatus(output) {
  const lines = output.split('\n').map(l => l.trim()).filter(l => l);
  
  const result = {
    status: 'unknown',
    jails: [],
  };
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Parse status line
    if (line.startsWith('Status')) {
      const match = line.match(/Status:\s*(.+)/i);
      if (match) {
        result.status = match[1].toLowerCase();
      }
    }
    
    // Parse jail list
    if (line.includes('Jail list:') || line.includes('Number of jail:')) {
      // Next line(s) contain jail names
      let jailLine = lines[i + 1] || '';
      
      // Sometimes jails are on the same line after "Jail list:"
      if (line.includes('Jail list:')) {
        const match = line.match(/Jail list:\s*(.+)/i);
        if (match) {
          jailLine = match[1];
        }
      }
      
      if (jailLine) {
        // Split by comma and clean up
        const jails = jailLine
          .split(',')
          .map(j => j.trim())
          .filter(j => j && j !== '');
        result.jails = jails;
      }
    }
  }
  
  return result;
}

/**
 * Parse fail2ban-client status <jail> output
 * @param {string} output - Output from fail2ban-client status <jail>
 * @param {string} jailName - Name of the jail
 * @returns {object} - Parsed jail details
 */
function parseJailStatus(output, jailName) {
  const lines = output.split('\n').map(l => l.trim()).filter(l => l);
  
  const result = {
    name: jailName,
    enabled: false,
    bannedIPs: [],
    filter: null,
    maxRetry: null,
    banTime: null,
    findTime: null,
  };
  
  for (const line of lines) {
    // Parse enabled status
    if (line.toLowerCase().includes('currently banned')) {
      const match = line.match(/(\d+)/);
      if (match) {
        // If we can parse a number, jail is likely enabled
        result.enabled = true;
      }
    }
    
    // Parse filter
    if (line.startsWith('Filter:')) {
      const match = line.match(/Filter:\s*(.+)/i);
      if (match) {
        result.filter = match[1].trim();
      }
    }
    
    // Parse max retry
    if (line.includes('Max retry:') || line.includes('maxretry:')) {
      const match = line.match(/max\s*retry[:\s]+(\d+)/i);
      if (match) {
        result.maxRetry = parseInt(match[1], 10);
      }
    }
    
    // Parse ban time
    if (line.includes('Ban time:') || line.includes('bantime:')) {
      const match = line.match(/ban\s*time[:\s]+(\d+)/i);
      if (match) {
        result.banTime = parseInt(match[1], 10);
      }
    }
    
    // Parse find time
    if (line.includes('Find time:') || line.includes('findtime:')) {
      const match = line.match(/find\s*time[:\s]+(\d+)/i);
      if (match) {
        result.findTime = parseInt(match[1], 10);
      }
    }
    
    // Parse banned IPs - look for "Banned IP list:" or "Currently banned:"
    if (line.includes('Banned IP list:') || line.includes('Currently banned:')) {
      // IPs might be on the same line or next lines
      let ipLine = line;
      if (line.includes('Banned IP list:')) {
        const match = line.match(/Banned IP list:\s*(.+)/i);
        if (match) {
          ipLine = match[1];
        } else {
          // IPs might be on next line
          const nextLineIdx = lines.indexOf(line) + 1;
          if (nextLineIdx < lines.length) {
            ipLine = lines[nextLineIdx];
          }
        }
      }
      
      // Extract IP addresses
      const ipRegex = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
      const ips = ipLine.match(ipRegex) || [];
      result.bannedIPs = ips;
      result.enabled = true; // If we have banned IPs, jail is enabled
    }
  }
  
  // If no banned IPs found but jail exists, it might still be enabled
  // Check for other indicators
  if (result.filter && !result.enabled) {
    // If filter exists, assume enabled unless explicitly disabled
    result.enabled = true;
  }
  
  return result;
}

/**
 * Extract jail names from status output
 * @param {string} output - Output from fail2ban-client status
 * @returns {string[]} - Array of jail names
 */
function extractJailNames(output) {
  const parsed = parseFail2banStatus(output);
  return parsed.jails;
}

module.exports = {
  parseFail2banStatus,
  parseJailStatus,
  extractJailNames,
};

