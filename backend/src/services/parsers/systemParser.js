/**
 * Parse system information from script output
 * Expected format (example):
 * hostname:server-name
 * uptime:5 days, 12:30:45
 * memory:2.5G/8G (31%)
 * disk:45G/100G (45%)
 * load:0.5, 0.6, 0.7
 * 
 * @param {string} output - Output from system-info.sh script
 * @returns {object} - Parsed system information
 */
function parseSystemInfo(output) {
  const lines = output.split('\n').map(l => l.trim()).filter(l => l);
  
  const result = {
    hostname: null,
    uptime: null,
    memory: null,
    disk: null,
    load: null,
  };
  
  for (const line of lines) {
    const lowerLine = line.toLowerCase();
    
    // Parse hostname
    if (lowerLine.startsWith('hostname:')) {
      result.hostname = line.split(':').slice(1).join(':').trim();
    } else if (lowerLine.includes('hostname') && !result.hostname) {
      // Try to extract hostname from any line
      const match = line.match(/hostname[:\s]+(.+)/i);
      if (match) {
        result.hostname = match[1].trim();
      }
    }
    
    // Parse uptime
    if (lowerLine.startsWith('uptime:')) {
      result.uptime = line.split(':').slice(1).join(':').trim();
    } else if (lowerLine.includes('uptime') && !result.uptime) {
      const match = line.match(/uptime[:\s]+(.+)/i);
      if (match) {
        result.uptime = match[1].trim();
      }
    }
    
    // Parse memory
    if (lowerLine.includes('memory:')) {
      result.memory = line.split(':').slice(1).join(':').trim();
    } else if (lowerLine.includes('mem') && !result.memory) {
      const match = line.match(/mem[ory]*[:\s]+(.+)/i);
      if (match) {
        result.memory = match[1].trim();
      }
    }
    
    // Parse disk
    if (lowerLine.includes('disk:')) {
      result.disk = line.split(':').slice(1).join(':').trim();
    } else if ((lowerLine.includes('disk') || lowerLine.includes('df')) && !result.disk) {
      const match = line.match(/(?:disk|df)[:\s]+(.+)/i);
      if (match) {
        result.disk = match[1].trim();
      }
    }
    
    // Parse load average
    if (lowerLine.includes('load:')) {
      result.load = line.split(':').slice(1).join(':').trim();
    } else if (lowerLine.includes('load average') && !result.load) {
      const match = line.match(/load average[:\s]+(.+)/i);
      if (match) {
        result.load = match[1].trim();
      }
    }
  }
  
  // If no structured format, try to extract from raw output
  if (!result.hostname) {
    // Try to get hostname from first non-empty line if it looks like a hostname
    const firstLine = lines[0];
    if (firstLine && !firstLine.includes(':') && !firstLine.includes(' ')) {
      result.hostname = firstLine;
    }
  }
  
  return result;
}

module.exports = {
  parseSystemInfo,
};

