const { detectFail2banError, extractIPs, findValueAfterAnchor, validateOutput } = require('./parserUtils');

/**
 * Safe defaults for monitor output
 */
const defaultMonitorOutput = {
  fail2ban: {
    status: 'unknown',
    jails: [],
    totalBanned: 0,
  },
  jails: [],
  nginx: {
    totalRequests: 0,
    topIPs: [],
    hiddenFilesAttacks: 0,
    webdavAttacks: 0,
    adminScans: 0,
    errors404: 0,
    robotsScans: 0,
  },
  system: {
    memory: null,
    disk: null,
    load: null,
    uptime: null,
  },
  timestamp: null,
  hostname: null,
  errors: [],
  partial: false,
};

/**
 * Parse output from monitor-security.sh script
 * This is the main monitoring script that provides comprehensive security data
 * @param {string} output - Output from monitor-security.sh
 * @returns {object} - Parsed monitoring data with error tracking
 */
function parseMonitorOutput(output) {
  // Validate input
  const validation = validateOutput(output);
  if (!validation.valid) {
    return { ...defaultMonitorOutput, errors: [validation.error], partial: true };
  }
  
  const lines = output.split('\n').map(l => l.trim());
  const errors = [];
  
  const result = {
    ...defaultMonitorOutput,
  };
  
  let currentSection = null;
  let currentJail = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Extract timestamp and hostname from header
    if (line.includes('СИГУРНОСТЕН МОНИТОРИНГ') || line.includes('Сървър:')) {
      const hostnameMatch = line.match(/Сървър:\s*(.+)/);
      if (hostnameMatch) {
        result.hostname = hostnameMatch[1].trim();
      }
      // Extract date from full output (might be on different line)
      const dateMatch = output.match(/СИГУРНОСТЕН МОНИТОРИНГ\s*-\s*(.+)/);
      if (dateMatch) {
        result.timestamp = dateMatch[1].trim();
      }
    }
    
    // Section detection - use flexible matching
    if (line.includes('FAIL2BAN СТАТИСТИКИ') || line.includes('🔒 FAIL2BAN') || 
        line.toLowerCase().includes('fail2ban')) {
      currentSection = 'fail2ban';
    } else if (line.includes('БЛОКИРАНИ IP') || line.includes('🚫 БЛОКИРАНИ') ||
               line.toLowerCase().includes('блокирани ip')) {
      currentSection = 'banned_ips';
    } else if (line.includes('NGINX СТАТИСТИКИ') || line.includes('📊 NGINX') ||
               line.toLowerCase().includes('nginx')) {
      currentSection = 'nginx';
    } else if (line.includes('СИСТЕМНИ РЕСУРСИ') || line.includes('💾 СИСТЕМНИ') ||
               line.toLowerCase().includes('системни')) {
      currentSection = 'system';
    }
    
    // Parse fail2ban status
    if (currentSection === 'fail2ban') {
      if (line.toLowerCase().includes('jail list')) {
        const match = line.match(/jail\s*list[:\s]+(.+)/i);
        if (match) {
          const jails = match[1]
            .split(',')
            .map(j => j.trim())
            .filter(j => j);
          result.fail2ban.jails = jails;
        }
      }
      if (line.toLowerCase().includes('status')) {
        const match = line.match(/status[:\s]+(.+)/i);
        if (match) {
          result.fail2ban.status = match[1].trim().toLowerCase();
        }
      }
    }
    
    // Parse banned IPs section
    if (currentSection === 'banned_ips') {
      // Jail name with banned count - flexible regex
      const jailMatch = line.match(/([a-zA-Z0-9._-]+)\s*\((\d+)\s*блокирани?\)/i);
      if (jailMatch) {
        currentJail = {
          name: jailMatch[1],
          bannedCount: parseInt(jailMatch[2], 10),
          bannedIPs: [],
        };
        result.jails.push(currentJail);
        result.fail2ban.totalBanned += currentJail.bannedCount;
      }
      
      // IP addresses (indented with spaces) - use extractIPs utility
      if (currentJail && /^\s{2,}\d+\.\d+\.\d+\.\d+/.test(line)) {
        const ips = extractIPs(line);
        if (ips.length > 0) {
          currentJail.bannedIPs.push(...ips);
        }
      }
      
      // Total banned count - anchor-based
      if (line.includes('Общо блокирани IP адреси') || 
          line.toLowerCase().includes('общо блокирани')) {
        const totalMatch = line.match(/(\d+)/);
        if (totalMatch) {
          result.fail2ban.totalBanned = parseInt(totalMatch[1], 10);
        }
      }
    }
    
    // Parse nginx statistics - REPLACE position-based with anchor-based
    if (currentSection === 'nginx') {
      // Total requests - use findValueAfterAnchor
      if (line.includes('Общо заявки') || line.toLowerCase().includes('общо заявки')) {
        const count = findValueAfterAnchor(lines, line, 3);
        if (count !== null) {
          result.nginx.totalRequests = count;
        }
      }
      
      // Top IPs (format: "  count ip")
      if (line.includes('Топ 10 IP адреси') || line.toLowerCase().includes('топ')) {
        let j = i + 1;
        while (j < lines.length && j < i + 12) {
          const ipLine = lines[j];
          const ipMatch = ipLine.match(/^\s*(\d+)\s+(\d+\.\d+\.\d+\.\d+)/);
          if (ipMatch) {
            result.nginx.topIPs.push({
              ip: ipMatch[2],
              count: parseInt(ipMatch[1], 10),
            });
          } else if (ipLine.includes('---') || ipLine === '' || 
                     ipLine.toLowerCase().includes('admin') ||
                     ipLine.toLowerCase().includes('webdav')) {
            // Stop if we hit separator or next section
            break;
          }
          j++;
        }
      }
      
      // Hidden files attacks - anchor-based
      if (line.includes('скрити файлове') || line.includes('hidden') || 
          line.toLowerCase().includes('скрити')) {
        const count = findValueAfterAnchor(lines, line, 3);
        if (count !== null) {
          result.nginx.hiddenFilesAttacks = count;
        }
      }
      
      // WebDAV attacks - anchor-based
      if (line.includes('WebDAV') || line.includes('PROPFIND')) {
        const count = findValueAfterAnchor(lines, line, 3);
        if (count !== null) {
          result.nginx.webdavAttacks = count;
        }
      }
      
      // Admin scanners - anchor-based
      if (line.includes('Admin скенери') || 
          (line.toLowerCase().includes('admin') && line.toLowerCase().includes('скенери'))) {
        const count = findValueAfterAnchor(lines, line, 3);
        if (count !== null) {
          result.nginx.adminScans = count;
        }
      }
      
      // 404 errors - anchor-based
      if (line.includes('404') || line.includes('404 грешки')) {
        const count = findValueAfterAnchor(lines, line, 3);
        if (count !== null) {
          result.nginx.errors404 = count;
        }
      }
      
      // Robots scans - anchor-based
      if (line.includes('Роботи') || line.toLowerCase().includes('robots')) {
        const count = findValueAfterAnchor(lines, line, 3);
        if (count !== null) {
          result.nginx.robotsScans = count;
        }
      }
    }
    
    // Parse system resources
    if (currentSection === 'system') {
      // Memory - flexible matching
      if (line.includes('Памет') || line.toLowerCase().includes('mem:')) {
        const memMatch = line.match(/mem:\s*(\S+)\s+(\S+)\s+(\S+)/i);
        if (memMatch) {
          result.system.memory = `${memMatch[2]}/${memMatch[1]}`;
        } else {
          // Try next line
          for (let j = i + 1; j < Math.min(i + 3, lines.length); j++) {
            const nextLine = lines[j];
            const nextMemMatch = nextLine.match(/mem:\s*(\S+)\s+(\S+)\s+(\S+)/i);
            if (nextMemMatch) {
              result.system.memory = `${nextMemMatch[2]}/${nextMemMatch[1]}`;
              break;
            }
          }
        }
      }
      
      // Disk - flexible matching
      if (line.includes('Дисково пространство') || 
          /^\S+\s+\d+\w+\s+\d+\w+\s+\d+\w+\s+\d+%/.test(line)) {
        const diskMatch = line.match(/(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\d+)%/);
        if (diskMatch) {
          result.system.disk = `${diskMatch[3]}/${diskMatch[2]} (${diskMatch[5]}%)`;
        }
      }
      
      // Load/Uptime - flexible matching
      if (line.includes('Натоварване') || line.toLowerCase().includes('load average')) {
        const loadMatch = line.match(/load\s*average[:\s]+(.+)/i);
        if (loadMatch) {
          result.system.load = loadMatch[1].trim();
        }
        // Also extract uptime if present
        const uptimeMatch = line.match(/up\s+(.+?)(?:,\s+load|$)/i);
        if (uptimeMatch) {
          result.system.uptime = uptimeMatch[1].trim();
        }
      }
    }
  }
  
  // Check for fail2ban errors in output
  const errorCheck = detectFail2banError(output);
  if (errorCheck.isError) {
    errors.push(errorCheck.message);
    result.partial = true;
  }
  
  result.errors = errors;
  return result;
}

/**
 * Parse quick-check.sh output
 * @param {string} output - Output from quick-check.sh
 * @returns {object} - Parsed quick status with error tracking
 */
function parseQuickCheck(output) {
  // Validate input
  const validation = validateOutput(output);
  if (!validation.valid) {
    return {
      jails: [],
      bannedCount: 0,
      recentAttacks: 0,
      errors: 0,
      errors: [validation.error],
      partial: true,
    };
  }
  
  const lines = output.split('\n').map(l => l.trim());
  const errors = [];
  
  const result = {
    jails: [],
    bannedCount: 0,
    recentAttacks: 0,
    errors: 0,
  };
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Extract jails - anchor-based
    if (line.includes('Fail2ban jails') || line.includes('🔒 Fail2ban') ||
        line.toLowerCase().includes('fail2ban jails')) {
      let j = i + 1;
      while (j < lines.length && lines[j].startsWith('  ')) {
        const jail = lines[j].trim();
        if (jail && !jail.includes('---') && !jail.includes('🚫')) {
          result.jails.push(jail);
        }
        j++;
      }
    }
    
    // Extract banned count - anchor-based
    if (line.includes('Блокирани IP') || line.includes('🚫 Блокирани') ||
        line.toLowerCase().includes('блокирани')) {
      const match = line.match(/(\d+)\s*блокирани/i);
      if (match) {
        result.bannedCount = parseInt(match[1], 10);
      }
    }
    
    // Extract recent attacks - anchor-based
    if (line.includes('Последни атаки') || line.includes('🔍 Последни') ||
        line.toLowerCase().includes('последни атаки')) {
      const match = line.match(/(\d+)\s*атаки/i);
      if (match) {
        result.recentAttacks = parseInt(match[1], 10);
      }
    }
    
    // Extract errors - anchor-based
    if (line.includes('Грешки') || line.includes('⚠️') ||
        line.toLowerCase().includes('грешки')) {
      const match = line.match(/(\d+)\s*грешки/i);
      if (match) {
        result.errors = parseInt(match[1], 10);
      }
    }
  }
  
  return { ...result, errors: errors, partial: false };
}

module.exports = {
  parseMonitorOutput,
  parseQuickCheck,
  defaultMonitorOutput,
};
