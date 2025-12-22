const { findValueAfterAnchor, validateOutput } = require('./parserUtils');

/**
 * Safe defaults for nginx statistics
 */
const defaultNginxStats = {
  404_count: 0,
  admin_scans: 0,
  webdav_attacks: 0,
  hidden_files_attempts: 0,
  robots_scans: 0,
  total_requests: 0,
  errors: [],
  partial: false,
};

/**
 * Parse nginx statistics from monitor-security.sh or other scripts
 * Handles both Bulgarian and English output
 * Uses anchor-based parsing instead of position-based
 * @param {string} output - Output from nginx stats script
 * @returns {object} - Parsed nginx statistics with error tracking
 */
function parseNginxStats(output) {
  // Validate input
  const validation = validateOutput(output);
  if (!validation.valid) {
    return { ...defaultNginxStats, errors: [validation.error], partial: true };
  }
  
  const lines = output.split('\n').map(l => l.trim()).filter(l => l);
  const errors = [];
  
  const result = {
    ...defaultNginxStats,
  };
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Parse 404 errors - anchor-based
    if (line.includes('404') || line.includes('404 грешки') ||
        line.toLowerCase().includes('404')) {
      const count = findValueAfterAnchor(lines, line, 3);
      if (count !== null) {
        result.404_count = count;
      }
    }
    
    // Parse admin scans - anchor-based
    if (line.includes('admin') || line.includes('Admin скенери') || 
        line.includes('wp-admin') || line.toLowerCase().includes('admin скенери')) {
      const count = findValueAfterAnchor(lines, line, 3);
      if (count !== null) {
        result.admin_scans = count;
      }
    }
    
    // Parse WebDAV attacks - anchor-based
    if (line.includes('WebDAV') || line.includes('PROPFIND')) {
      const count = findValueAfterAnchor(lines, line, 3);
      if (count !== null) {
        result.webdav_attacks = count;
      }
    }
    
    // Parse hidden files attempts - anchor-based
    if (line.includes('скрити файлове') || line.includes('hidden') || 
        line.includes('.env') || line.includes('.git') ||
        line.toLowerCase().includes('скрити')) {
      const count = findValueAfterAnchor(lines, line, 3);
      if (count !== null) {
        result.hidden_files_attempts = count;
      }
    }
    
    // Parse robots scans - anchor-based
    if (line.includes('Роботи') || line.includes('robots') ||
        line.toLowerCase().includes('роботи')) {
      const count = findValueAfterAnchor(lines, line, 3);
      if (count !== null) {
        result.robots_scans = count;
      }
    }
    
    // Parse total requests - anchor-based
    if (line.includes('Общо заявки') || line.includes('total requests') ||
        line.toLowerCase().includes('общо заявки')) {
      const count = findValueAfterAnchor(lines, line, 3);
      if (count !== null) {
        result.total_requests = count;
      }
    }
  }
  
  result.errors = errors;
  return result;
}

module.exports = {
  parseNginxStats,
  defaultNginxStats,
};
