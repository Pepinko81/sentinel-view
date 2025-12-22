/**
 * Parse nginx statistics from monitor-security.sh or other scripts
 * Handles both Bulgarian and English output
 * @param {string} output - Output from nginx stats script
 * @returns {object} - Parsed nginx statistics
 */
function parseNginxStats(output) {
  const lines = output.split('\n').map(l => l.trim()).filter(l => l);
  
  const result = {
    404_count: 0,
    admin_scans: 0,
    webdav_attacks: 0,
    hidden_files_attempts: 0,
    robots_scans: 0,
    total_requests: 0,
  };
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const nextLine = i + 1 < lines.length ? lines[i + 1] : '';
    
    // Parse 404 errors
    if (line.includes('404') || line.includes('404 грешки')) {
      const count = parseInt(nextLine, 10) || parseInt(line.match(/(\d+)/)?.[1] || '0', 10);
      if (!isNaN(count)) {
        result.404_count = count;
      }
    }
    
    // Parse admin scans
    if (line.includes('admin') || line.includes('Admin скенери') || line.includes('wp-admin')) {
      const count = parseInt(nextLine, 10) || parseInt(line.match(/(\d+)/)?.[1] || '0', 10);
      if (!isNaN(count)) {
        result.admin_scans = count;
      }
    }
    
    // Parse WebDAV attacks
    if (line.includes('WebDAV') || line.includes('PROPFIND')) {
      const count = parseInt(nextLine, 10) || parseInt(line.match(/(\d+)/)?.[1] || '0', 10);
      if (!isNaN(count)) {
        result.webdav_attacks = count;
      }
    }
    
    // Parse hidden files attempts
    if (line.includes('скрити файлове') || line.includes('hidden') || line.includes('.env') || line.includes('.git')) {
      const count = parseInt(nextLine, 10) || parseInt(line.match(/(\d+)/)?.[1] || '0', 10);
      if (!isNaN(count)) {
        result.hidden_files_attempts = count;
      }
    }
    
    // Parse robots scans
    if (line.includes('Роботи') || line.includes('robots')) {
      const count = parseInt(nextLine, 10) || parseInt(line.match(/(\d+)/)?.[1] || '0', 10);
      if (!isNaN(count)) {
        result.robots_scans = count;
      }
    }
    
    // Parse total requests
    if (line.includes('Общо заявки') || line.includes('total requests')) {
      const count = parseInt(nextLine, 10) || parseInt(line.match(/(\d+)/)?.[1] || '0', 10);
      if (!isNaN(count)) {
        result.total_requests = count;
      }
    }
  }
  
  return result;
}

module.exports = {
  parseNginxStats,
};
