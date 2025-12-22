require('dotenv').config();
const path = require('path');

const config = {
  // Server configuration
  port: process.env.PORT || 3001,
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // Authentication
  authToken: process.env.AUTH_TOKEN || process.env.API_TOKEN || 'change-me-in-production',
  
  // Cache configuration
  cache: {
    defaultTTL: parseInt(process.env.CACHE_TTL) || 5000, // 5 seconds
    overviewTTL: parseInt(process.env.CACHE_OVERVIEW_TTL) || 5000,
    jailsTTL: parseInt(process.env.CACHE_JAILS_TTL) || 5000,
    nginxTTL: parseInt(process.env.CACHE_NGINX_TTL) || 10000, // 10 seconds
    systemTTL: parseInt(process.env.CACHE_SYSTEM_TTL) || 30000, // 30 seconds
  },
  
  // Script execution
  scriptTimeout: parseInt(process.env.SCRIPT_TIMEOUT) || 30000, // 30 seconds
  // Use actual server scripts directory
  scriptsDir: process.env.SCRIPTS_DIR || path.join(__dirname, '../../../opt/fail2ban-dashboard/scripts'),
  
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
 * Fails fast if required environment variables are missing
 */
function validateConfig() {
  const required = ['AUTH_TOKEN', 'SCRIPTS_DIR'];
  const missing = [];
  const warnings = [];
  
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
  
  // Check SCRIPTS_DIR
  if (!config.scriptsDir || config.scriptsDir.includes('opt/fail2ban-dashboard/scripts')) {
    // If using default path, check if it exists
    const fs = require('fs');
    if (!fs.existsSync(config.scriptsDir)) {
      warnings.push(`SCRIPTS_DIR path does not exist: ${config.scriptsDir}`);
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
  
  // Warn about production defaults
  if (config.nodeEnv === 'production') {
    if (config.authToken === 'change-me-in-production') {
      console.error('❌ AUTH_TOKEN must be set in production!');
      console.error('   Using default token in production is a security risk.\n');
      process.exit(1);
    }
    
    if (config.port === 3001) {
      warnings.push('Using default port 3001 in production');
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
  }
}

// Attach validation to config object
config.validate = validateConfig;

module.exports = config;

