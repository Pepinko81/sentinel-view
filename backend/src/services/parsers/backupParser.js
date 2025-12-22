/**
 * Parse backup-fail2ban.sh output
 * @param {string} output - Output from backup-fail2ban.sh
 * @returns {object} - Parsed backup information
 */
function parseBackupOutput(output) {
  const lines = output.split('\n').map(l => l.trim());
  
  const result = {
    success: false,
    filename: null,
    path: null,
    size: null,
    sizeFormatted: null,
    timestamp: new Date().toISOString(),
  };
  
  for (const line of lines) {
    // Check for success
    if (line.includes('✅') || line.includes('успешно') || line.includes('Бекъп създаден')) {
      result.success = true;
    }
    
    // Extract file path
    if (line.includes('Файл:') || line.includes('File:')) {
      const match = line.match(/(?:Файл|File):\s*(.+)/);
      if (match) {
        result.path = match[1].trim();
        result.filename = result.path.split('/').pop();
      }
    }
    
    // Extract size
    if (line.includes('Размер:') || line.includes('Size:')) {
      const match = line.match(/(?:Размер|Size):\s*(.+)/);
      if (match) {
        result.sizeFormatted = match[1].trim();
        // Try to parse size to bytes
        const sizeMatch = result.sizeFormatted.match(/([\d.]+)\s*([KMGT]?B)/i);
        if (sizeMatch) {
          const value = parseFloat(sizeMatch[1]);
          const unit = sizeMatch[2].toUpperCase();
          const multipliers = { B: 1, KB: 1024, MB: 1024 * 1024, GB: 1024 * 1024 * 1024 };
          result.size = Math.round(value * (multipliers[unit] || 1));
        }
      }
    }
    
    // Extract path from backup file pattern
    if (!result.path && line.includes('fail2ban-config-') && line.includes('.tar.gz')) {
      const pathMatch = line.match(/(\/[^\s]+fail2ban-config-\d+_\d+\.tar\.gz)/);
      if (pathMatch) {
        result.path = pathMatch[1];
        result.filename = result.path.split('/').pop();
      }
    }
  }
  
  return result;
}

module.exports = {
  parseBackupOutput,
};

