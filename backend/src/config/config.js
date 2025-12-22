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

module.exports = config;

