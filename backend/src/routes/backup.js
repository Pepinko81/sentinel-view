const express = require('express');
const router = express.Router();
const { executeScript } = require('../services/scriptExecutor');
const { parseBackupOutput } = require('../services/parsers/backupParser');
const { backupLimiter } = require('../middleware/rateLimiter');
const fs = require('fs').promises;
const path = require('path');

// Apply stricter rate limiting to backup endpoint
router.use(backupLimiter);

/**
 * POST /api/backup
 * Triggers backup script
 * Returns backup filename & size
 * Uses backup-fail2ban.sh
 */
router.post('/', async (req, res, next) => {
  try {
    // Execute backup script (no caching)
    const { stdout, stderr } = await executeScript('backup-fail2ban.sh');
    
    // Parse backup output
    const backupData = parseBackupOutput(stdout + '\n' + stderr);
    
    // If parsing didn't find the file, try to find it in the backup directory
    if (!backupData.path || !backupData.success) {
      const backupDir = '/home/pepinko/fail2ban-backups';
      try {
        const files = await fs.readdir(backupDir);
        const backupFiles = files
          .filter(f => f.startsWith('fail2ban-config-') && f.endsWith('.tar.gz'))
          .map(f => path.join(backupDir, f))
          .sort()
          .reverse();
        
        if (backupFiles.length > 0) {
          const latestBackup = backupFiles[0];
          const stats = await fs.stat(latestBackup);
          
          backupData.success = true;
          backupData.path = latestBackup;
          backupData.filename = path.basename(latestBackup);
          backupData.size = stats.size;
          backupData.sizeFormatted = formatBytes(stats.size);
        }
      } catch (err) {
        console.warn('Could not find backup file:', err.message);
      }
    }
    
    res.json({
      success: backupData.success,
      filename: backupData.filename || 'unknown',
      path: backupData.path || 'unknown',
      size: backupData.size || 0,
      sizeFormatted: backupData.sizeFormatted || '0 B',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

module.exports = router;
