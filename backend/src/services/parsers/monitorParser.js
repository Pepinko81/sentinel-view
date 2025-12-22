/**
 * Parse output from monitor-security.sh script
 * This is the main monitoring script that provides comprehensive security data
 * @param {string} output - Output from monitor-security.sh
 * @returns {object} - Parsed monitoring data
 */
function parseMonitorOutput(output) {
  const lines = output.split('\n').map(l => l.trim());
  
  const result = {
    fail2ban: {
      status: 'unknown',
      jails: [],
      totalBanned: 0,
    },
    jails: [], // Detailed jail info with banned IPs
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
      const dateMatch = output.match(/СИГУРНОСТЕН МОНИТОРИНГ - (.+)/);
      if (dateMatch) {
        result.timestamp = dateMatch[1].trim();
      }
    }
    
    // Section detection
    if (line.includes('FAIL2BAN СТАТИСТИКИ') || line.includes('🔒 FAIL2BAN')) {
      currentSection = 'fail2ban';
    } else if (line.includes('БЛОКИРАНИ IP') || line.includes('🚫 БЛОКИРАНИ')) {
      currentSection = 'banned_ips';
    } else if (line.includes('NGINX СТАТИСТИКИ') || line.includes('📊 NGINX')) {
      currentSection = 'nginx';
    } else if (line.includes('СИСТЕМНИ РЕСУРСИ') || line.includes('💾 СИСТЕМНИ')) {
      currentSection = 'system';
    }
    
    // Parse fail2ban status
    if (currentSection === 'fail2ban') {
      if (line.includes('Jail list:')) {
        const match = line.match(/Jail list:\s*(.+)/i);
        if (match) {
          const jails = match[1]
            .split(',')
            .map(j => j.trim())
            .filter(j => j);
          result.fail2ban.jails = jails;
        }
      }
      if (line.includes('Status:')) {
        const match = line.match(/Status:\s*(.+)/i);
        if (match) {
          result.fail2ban.status = match[1].trim().toLowerCase();
        }
      }
    }
    
    // Parse banned IPs section
    if (currentSection === 'banned_ips') {
      // Jail name with banned count: "  jail-name (N блокирани):"
      const jailMatch = line.match(/^\s*([a-zA-Z0-9._-]+)\s*\((\d+)\s*блокирани\):/);
      if (jailMatch) {
        currentJail = {
          name: jailMatch[1],
          bannedCount: parseInt(jailMatch[2], 10),
          bannedIPs: [],
        };
        result.jails.push(currentJail);
        result.fail2ban.totalBanned += currentJail.bannedCount;
      }
      
      // IP addresses (indented with spaces)
      if (currentJail && line.match(/^\s{4,}\d+\.\d+\.\d+\.\d+/)) {
        const ipMatch = line.match(/(\d+\.\d+\.\d+\.\d+)/);
        if (ipMatch) {
          currentJail.bannedIPs.push(ipMatch[1]);
        }
      }
      
      // Total banned count
      if (line.includes('Общо блокирани IP адреси:')) {
        const match = line.match(/Общо блокирани IP адреси:\s*(\d+)/);
        if (match) {
          result.fail2ban.totalBanned = parseInt(match[1], 10);
        }
      }
    }
    
    // Parse nginx statistics
    if (currentSection === 'nginx') {
      // Total requests
      if (line.includes('Общо заявки:') && i + 1 < lines.length) {
        const count = parseInt(lines[i + 1], 10);
        if (!isNaN(count)) {
          result.nginx.totalRequests = count;
        }
      }
      
      // Top IPs (format: "  count ip")
      if (line.includes('Топ 10 IP адреси:')) {
        let j = i + 1;
        while (j < lines.length && j < i + 12) {
          const ipLine = lines[j];
          const ipMatch = ipLine.match(/^\s*(\d+)\s+(\d+\.\d+\.\d+\.\d+)/);
          if (ipMatch) {
            result.nginx.topIPs.push({
              ip: ipMatch[2],
              count: parseInt(ipMatch[1], 10),
            });
          } else if (ipLine.includes('---') || ipLine === '') {
            break;
          }
          j++;
        }
      }
      
      // Hidden files attacks
      if (line.includes('Атаки срещу скрити файлове:')) {
        const count = parseInt(lines[i + 1], 10);
        if (!isNaN(count)) {
          result.nginx.hiddenFilesAttacks = count;
        }
      }
      
      // WebDAV attacks
      if (line.includes('WebDAV атаки') || line.includes('PROPFIND')) {
        const count = parseInt(lines[i + 1], 10);
        if (!isNaN(count)) {
          result.nginx.webdavAttacks = count;
        }
      }
      
      // Admin scanners
      if (line.includes('Admin скенери:') || line.includes('admin')) {
        const count = parseInt(lines[i + 1], 10);
        if (!isNaN(count)) {
          result.nginx.adminScans = count;
        }
      }
      
      // 404 errors
      if (line.includes('404 грешки:') || line.includes('404')) {
        const count = parseInt(lines[i + 1], 10);
        if (!isNaN(count)) {
          result.nginx.errors404 = count;
        }
      }
      
      // Robots scans
      if (line.includes('Роботи') || line.includes('robots')) {
        const count = parseInt(lines[i + 1], 10);
        if (!isNaN(count)) {
          result.nginx.robotsScans = count;
        }
      }
    }
    
    // Parse system resources
    if (currentSection === 'system') {
      // Memory
      if (line.includes('Памет:') || line.includes('Mem:')) {
        const memMatch = line.match(/Mem:\s*(\S+)\s+(\S+)\s+(\S+)/);
        if (memMatch) {
          result.system.memory = `${memMatch[2]}/${memMatch[1]}`;
        } else if (i + 1 < lines.length) {
          const nextLine = lines[i + 1];
          const memMatch = nextLine.match(/Mem:\s*(\S+)\s+(\S+)\s+(\S+)/);
          if (memMatch) {
            result.system.memory = `${memMatch[2]}/${memMatch[1]}`;
          }
        }
      }
      
      // Disk
      if (line.includes('Дисково пространство:') || line.match(/^\S+\s+\d+\w+\s+\d+\w+\s+\d+\w+\s+\d+%/)) {
        const diskMatch = line.match(/(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\d+)%/);
        if (diskMatch) {
          result.system.disk = `${diskMatch[3]}/${diskMatch[2]} (${diskMatch[5]}%)`;
        }
      }
      
      // Load/Uptime
      if (line.includes('Натоварване:') || line.includes('load average:')) {
        const loadMatch = line.match(/load average:\s*(.+)/i);
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
  
  return result;
}

/**
 * Parse quick-check.sh output
 * @param {string} output - Output from quick-check.sh
 * @returns {object} - Parsed quick status
 */
function parseQuickCheck(output) {
  const lines = output.split('\n').map(l => l.trim());
  
  const result = {
    jails: [],
    bannedCount: 0,
    recentAttacks: 0,
    errors: 0,
  };
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Extract jails
    if (line.includes('Fail2ban jails:') || line.includes('🔒 Fail2ban')) {
      let j = i + 1;
      while (j < lines.length && lines[j].startsWith('  ')) {
        const jail = lines[j].trim();
        if (jail && !jail.includes('---')) {
          result.jails.push(jail);
        }
        j++;
      }
    }
    
    // Extract banned count
    if (line.includes('Блокирани IP:') || line.includes('🚫 Блокирани')) {
      const match = line.match(/(\d+)\s*блокирани/);
      if (match) {
        result.bannedCount = parseInt(match[1], 10);
      }
    }
    
    // Extract recent attacks
    if (line.includes('Последни атаки:') || line.includes('🔍 Последни')) {
      const match = line.match(/(\d+)\s*атаки/);
      if (match) {
        result.recentAttacks = parseInt(match[1], 10);
      }
    }
    
    // Extract errors
    if (line.includes('Грешки:') || line.includes('⚠️')) {
      const match = line.match(/(\d+)\s*грешки/);
      if (match) {
        result.errors = parseInt(match[1], 10);
      }
    }
  }
  
  return result;
}

module.exports = {
  parseMonitorOutput,
  parseQuickCheck,
};

