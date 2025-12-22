const { validateOutput } = require('./parserUtils');

/**
 * Safe defaults for backup output
 */
const defaultBackupOutput = {
  success: false,
  filename: null,
  path: null,
  size: null,
  sizeFormatted: null,
  timestamp: new Date().toISOString(),
  errors: [],
  partial: false,
};

/**
 * Parse backup-fail2ban.sh output
 * @param {string} output - Output from backup-fail2ban.sh
 * @returns {object} - Parsed backup information with error tracking
 */
function parseBackupOutput(output) {
  // Validate input
  const validation = validateOutput(output);
  if (!validation.valid) {
    return { ...defaultBackupOutput, errors: [validation.error], partial: true };
  }
  
  const lines = output.split('\n').map(l => l.trim());
  const errors = [];
  
  const result = {
    ...defaultBackupOutput,
    timestamp: new Date().toISOString(),
  };
  
  for (const line of lines) {
    // Check for success - multiple indicators
    if (line.includes('✅') || line.includes('успешно') || 
        line.includes('Бекъп създаден') || line.toLowerCase().includes('success')) {
      result.success = true;
    }
    
    // Check for failure indicators
    if (line.includes('❌') || line.includes('Грешка') || 
        line.toLowerCase().includes('error') || line.toLowerCase().includes('failed')) {
      result.success = false;
      if (!errors.some(e => e.includes('backup failed'))) {
        errors.push('Backup operation failed');
      }
    }
    
    // Extract file path - flexible matching
    if (line.includes('Файл:') || line.includes('File:') ||
        line.toLowerCase().includes('файл:')) {
      const match = line.match(/(?:Файл|File)[:\s]+(.+)/i);
      if (match) {
        result.path = match[1].trim();
        result.filename = result.path.split('/').pop();
      }
    }
    
    // Extract size - flexible matching
    if (line.includes('Размер:') || line.includes('Size:') ||
        line.toLowerCase().includes('размер:')) {
      const match = line.match(/(?:Размер|Size)[:\s]+(.+)/i);
      if (match) {
        result.sizeFormatted = match[1].trim();
        // Try to parse size to bytes
        const sizeMatch = result.sizeFormatted.match(/([\d.]+)\s*([KMGT]?B)/i);
        if (sizeMatch) {
          const value = parseFloat(sizeMatch[1]);
          const unit = sizeMatch[2].toUpperCase();
          const multipliers = { 
            B: 1, 
            KB: 1024, 
            MB: 1024 * 1024, 
            GB: 1024 * 1024 * 1024,
            TB: 1024 * 1024 * 1024 * 1024
          };
          result.size = Math.round(value * (multipliers[unit] || 1));
        }
      }
    }
    
    // Extract path from backup file pattern - fallback
    if (!result.path && line.includes('fail2ban-config-') && line.includes('.tar.gz')) {
      const pathMatch = line.match(/(\/[^\s]+fail2ban-config-\d+_\d+\.tar\.gz)/);
      if (pathMatch) {
        result.path = pathMatch[1];
        result.filename = result.path.split('/').pop();
      }
    }
  }
  
  // If we found a path but no success indicator, assume success
  if (result.path && result.success === false && errors.length === 0) {
    result.success = true;
  }
  
  result.errors = errors;
  if (errors.length > 0 || !result.success) {
    result.partial = true;
  }
  
  return result;
}

module.exports = {
  parseBackupOutput,
  defaultBackupOutput,
};
