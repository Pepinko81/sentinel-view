const path = require('path');
const fs = require('fs');

// Determine environment FIRST (before loading any .env files)
const nodeEnv = process.env.NODE_ENV || 'development';

// Deterministic env loading order:
// 1. Load base .env file (if exists)
const baseEnvPath = path.join(__dirname, '../../.env');
if (fs.existsSync(baseEnvPath)) {
  require('dotenv').config({ path: baseEnvPath });
}

// 2. Load environment-specific .env file (overrides base)
const envSpecificPath = path.join(__dirname, `../../.env.${nodeEnv}`);
if (fs.existsSync(envSpecificPath)) {
  require('dotenv').config({ path: envSpecificPath, override: true });
}

// 3. System environment variables override everything (already loaded by process.env)

// Log loaded environment for debugging
if (nodeEnv === 'development') {
  console.log(`📋 Environment: ${nodeEnv}`);
  console.log(`📋 Loaded .env files: ${fs.existsSync(baseEnvPath) ? '.env' : '(none)'}${fs.existsSync(envSpecificPath) ? `, .env.${nodeEnv}` : ''}`);
}

const config = {
  // Server configuration
  port: process.env.PORT || 3002,
  nodeEnv: nodeEnv,
  
  // Authentication
  authToken: process.env.AUTH_TOKEN || process.env.API_TOKEN || 'change-me-in-production',
  
  // Cache configuration
  cache: {
    defaultTTL: parseInt(process.env.CACHE_TTL) || 5000, // 5 seconds
    overviewTTL: parseInt(process.env.CACHE_OVERVIEW_TTL) || 10000, // 10 seconds (optimized for <300ms)
    jailsTTL: parseInt(process.env.CACHE_JAILS_TTL) || 5000,
    nginxTTL: parseInt(process.env.CACHE_NGINX_TTL) || 10000, // 10 seconds
    systemTTL: parseInt(process.env.CACHE_SYSTEM_TTL) || 30000, // 30 seconds
  },
  
  // Performance configuration
  performance: {
    // Enable performance monitoring (default: true in dev, false in prod)
    monitoring: process.env.PERFORMANCE_MONITORING !== undefined 
      ? process.env.PERFORMANCE_MONITORING === 'true'
      : process.env.NODE_ENV === 'development',
    // Response time thresholds (ms)
    slowRequestThreshold: parseInt(process.env.SLOW_REQUEST_THRESHOLD) || 300,
    verySlowRequestThreshold: parseInt(process.env.VERY_SLOW_REQUEST_THRESHOLD) || 1000,
    // Overview endpoint optimization
    overviewMaxResponseTime: parseInt(process.env.OVERVIEW_MAX_RESPONSE_TIME) || 250,
    overviewScriptTimeout: parseInt(process.env.OVERVIEW_SCRIPT_TIMEOUT) || 2000,
  },
  
  // Script execution
  scriptTimeout: parseInt(process.env.SCRIPT_TIMEOUT) || 30000, // 30 seconds
  
  // Scripts directory - STRICTLY from environment variable (no hardcoded defaults)
  // Must be set in .env.development or .env.production
  scriptsDir: process.env.SCRIPTS_DIR ? process.env.SCRIPTS_DIR.trim() : null,
  
  // Fail2ban availability flag
  fail2banAvailable: process.env.FAIL2BAN_AVAILABLE === 'true' || 
                      (process.env.FAIL2BAN_AVAILABLE === undefined && nodeEnv === 'production'),
  
  // Sudo configuration
  sudoUser: process.env.SUDO_USER || null, // null = current user
  
  // Paths
  nginxAccessLog: process.env.NGINX_ACCESS_LOG || '/var/log/nginx/access.log',
  fail2banConfig: process.env.FAIL2BAN_CONFIG || '/etc/fail2ban',
  
  // CORS
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173', // Vite default
  
  // Rate limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW) || 60000, // 1 minute
    max: parseInt(process.env.RATE_LIMIT_MAX) || 100, // requests per window
  },
};

/**
 * Validate configuration on startup
 * - Warns in development (non-fatal)
 * - Fails fast in production (fatal)
 */
function validateConfig() {
  const required = ['AUTH_TOKEN'];
  const missing = [];
  const warnings = [];
  const errors = [];
  
  // Check required variables
  required.forEach(key => {
    const value = process.env[key];
    if (!value || value.trim() === '' || value === 'change-me-in-production') {
      missing.push(key);
    }
  });
  
  // Check AUTH_TOKEN specifically
  if (!config.authToken || config.authToken === 'change-me-in-production') {
    if (!missing.includes('AUTH_TOKEN')) {
      missing.push('AUTH_TOKEN');
    }
  }
  
  // Check SCRIPTS_DIR - REQUIRED (no hardcoded fallback)
  // Log what we're checking for debugging
  if (config.nodeEnv === 'development') {
    console.log(`📋 SCRIPTS_DIR from env: ${process.env.SCRIPTS_DIR ? 'SET' : 'NOT SET'}`);
    if (process.env.SCRIPTS_DIR) {
      console.log(`📋 SCRIPTS_DIR value: ${process.env.SCRIPTS_DIR}`);
    }
  }
  
  if (!config.scriptsDir || config.scriptsDir.trim() === '') {
    if (config.nodeEnv === 'production') {
      errors.push('SCRIPTS_DIR is required in production and must be set in .env.production');
    } else {
      warnings.push('SCRIPTS_DIR not set - script execution will fail. Set it in .env.development');
    }
  } else {
    // Validate SCRIPTS_DIR path exists and is accessible
    const scriptsDir = path.resolve(config.scriptsDir);
    
    if (!fs.existsSync(scriptsDir)) {
      if (config.nodeEnv === 'production') {
        errors.push(`SCRIPTS_DIR path does not exist: ${scriptsDir}`);
      } else {
        warnings.push(`SCRIPTS_DIR path does not exist: ${scriptsDir}`);
      }
    } else {
      // Check if it's a directory
      const stats = fs.statSync(scriptsDir);
      if (!stats.isDirectory()) {
        if (config.nodeEnv === 'production') {
          errors.push(`SCRIPTS_DIR is not a directory: ${scriptsDir}`);
        } else {
          warnings.push(`SCRIPTS_DIR is not a directory: ${scriptsDir}`);
        }
      } else {
        // Check if readable
        try {
          fs.accessSync(scriptsDir, fs.constants.R_OK);
        } catch (err) {
          if (config.nodeEnv === 'production') {
            errors.push(`SCRIPTS_DIR is not readable: ${scriptsDir}`);
          } else {
            warnings.push(`SCRIPTS_DIR is not readable: ${scriptsDir}`);
          }
        }
        
        // Check for required scripts (non-fatal, just warning)
        const requiredScripts = ['monitor-security.sh', 'quick-check.sh'];
        const missingScripts = requiredScripts.filter(script => {
          const scriptPath = path.join(scriptsDir, script);
          return !fs.existsSync(scriptPath);
        });
        
        if (missingScripts.length > 0) {
          warnings.push(`Some required scripts are missing: ${missingScripts.join(', ')}`);
        }
      }
    }
  }
  
  // Check fail2ban availability
  if (config.fail2banAvailable) {
    // Try to detect if fail2ban-client is available
    const { execSync } = require('child_process');
    try {
      execSync('which fail2ban-client', { stdio: 'ignore' });
    } catch (err) {
      warnings.push('FAIL2BAN_AVAILABLE=true but fail2ban-client not found in PATH');
    }
  }
  
  // Fail if required variables are missing
  if (missing.length > 0) {
    console.error('\n❌ Missing required environment variables:');
    missing.forEach(key => {
      console.error(`   - ${key}`);
    });
    console.error('\n💡 Create .env file or set environment variables');
    console.error('💡 See .env.example for reference');
    console.error('\nExample:');
    console.error('   AUTH_TOKEN=your-secure-random-token-here');
    console.error('   SCRIPTS_DIR=/opt/fail2ban-dashboard/scripts\n');
    process.exit(1);
  }
  
  // Fail on errors in production
  if (errors.length > 0) {
    console.error('\n❌ Configuration errors (production mode):');
    errors.forEach(error => {
      console.error(`   - ${error}`);
    });
    console.error('\n💡 Fix these errors before starting in production\n');
    process.exit(1);
  }
  
  // Warn about production defaults
  if (config.nodeEnv === 'production') {
    if (config.authToken === 'change-me-in-production') {
      console.error('❌ AUTH_TOKEN must be set in production!');
      console.error('   Using default token in production is a security risk.\n');
      process.exit(1);
    }
    
    if (config.port === 3002) {
      warnings.push('Using default port 3002 in production');
    }
    
    if (!config.scriptsDir) {
      console.error('❌ SCRIPTS_DIR must be set in production!');
      process.exit(1);
    }
  }
  
  // Show warnings (non-fatal)
  if (warnings.length > 0) {
    console.warn('\n⚠️  Configuration warnings:');
    warnings.forEach(warning => {
      console.warn(`   - ${warning}`);
    });
    console.warn('');
  }
  
  // Success message
  if (config.nodeEnv === 'development') {
    console.log('✅ Configuration validated successfully');
    if (warnings.length > 0) {
      console.log('   (Some warnings present - see above)');
    }
  } else {
    console.log('✅ Configuration validated successfully');
  }
}

// Attach validation to config object
config.validate = validateConfig;

module.exports = config;
