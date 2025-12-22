const express = require('express');
const router = express.Router();
const { API_VERSION } = require('../config/api');
const config = require('../config/config');
const fs = require('fs');
const { execFile } = require('child_process');
const { promisify } = require('util');
const execFileAsync = promisify(execFile);
const path = require('path');

/**
 * GET /health
 * Comprehensive health check endpoint
 * Response time target: <50ms
 * No authentication required
 */
router.get('/', async (req, res) => {
  const startTime = Date.now();
  
  // Basic status
  const status = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    version: API_VERSION,
    dependencies: {},
  };
  
  // Quick dependency checks (non-blocking, fast)
  const checks = await Promise.allSettled([
    checkFail2ban(),
    checkScriptsDirectory(),
    checkCache(),
  ]);
  
  // Process check results
  let hasFailures = false;
  
  if (checks[0].status === 'fulfilled') {
    status.dependencies.fail2ban = checks[0].value;
    if (checks[0].value !== 'available') {
      hasFailures = true;
    }
  } else {
    status.dependencies.fail2ban = 'unknown';
    hasFailures = true;
  }
  
  if (checks[1].status === 'fulfilled') {
    status.dependencies.scripts = checks[1].value;
    if (checks[1].value !== 'accessible') {
      hasFailures = true;
    }
  } else {
    status.dependencies.scripts = 'unknown';
    hasFailures = true;
  }
  
  if (checks[2].status === 'fulfilled') {
    status.dependencies.cache = checks[2].value;
    if (checks[2].value !== 'operational') {
      hasFailures = true;
    }
  } else {
    status.dependencies.cache = 'unknown';
    hasFailures = true;
  }
  
  // Update status based on dependencies
  if (hasFailures) {
    // Check if critical dependencies are down
    const criticalDown = status.dependencies.fail2ban === 'unavailable' &&
                        status.dependencies.scripts === 'inaccessible';
    
    status.status = criticalDown ? 'down' : 'degraded';
  }
  
  // Add response time
  const responseTime = Date.now() - startTime;
  status.responseTime = responseTime;
  
  // Set appropriate status code
  const statusCode = status.status === 'down' ? 503 : 
                     status.status === 'degraded' ? 200 : 200;
  
  res.status(statusCode).json(status);
});

/**
 * Check fail2ban service availability
 * Quick check using fail2ban-client status (with timeout)
 */
async function checkFail2ban() {
  try {
    // Quick check with 1 second timeout
    await Promise.race([
      execFileAsync('fail2ban-client', ['status'], {
        timeout: 1000,
        maxBuffer: 1024,
      }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), 1000)
      ),
    ]);
    
    return 'available';
  } catch (err) {
    // Service unavailable or timeout
    return 'unavailable';
  }
}

/**
 * Check scripts directory accessibility
 */
async function checkScriptsDirectory() {
  try {
    const scriptsDir = config.scriptsDir;
    
    if (!scriptsDir) {
      return 'not_configured';
    }
    
    // Check if directory exists and is readable
    if (!fs.existsSync(scriptsDir)) {
      return 'not_found';
    }
    
    // Check if it's a directory
    const stats = fs.statSync(scriptsDir);
    if (!stats.isDirectory()) {
      return 'not_directory';
    }
    
    // Check if readable
    try {
      fs.accessSync(scriptsDir, fs.constants.R_OK);
    } catch (err) {
      return 'not_readable';
    }
    
    // Check if key scripts exist
    const requiredScripts = ['monitor-security.sh', 'quick-check.sh'];
    const missingScripts = requiredScripts.filter(script => {
      const scriptPath = path.join(scriptsDir, script);
      return !fs.existsSync(scriptPath);
    });
    
    if (missingScripts.length > 0) {
      return 'incomplete';
    }
    
    return 'accessible';
  } catch (err) {
    return 'error';
  }
}

/**
 * Check cache status
 */
async function checkCache() {
  try {
    const cache = require('../services/cache');
    
    // Simple check: try to get/set a test value
    const testKey = '__health_check__';
    const testValue = Date.now();
    
    cache.set(testKey, testValue, 1000);
    const retrieved = cache.get(testKey);
    
    if (retrieved === testValue) {
      cache.delete(testKey); // Clean up
      return 'operational';
    } else {
      return 'malfunctioning';
    }
  } catch (err) {
    return 'error';
  }
}

module.exports = router;

