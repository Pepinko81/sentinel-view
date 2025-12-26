/**
 * Environment Configuration
 * Centralized environment variable handling with defaults
 */

const nodeEnv = process.env.NODE_ENV || 'development';

// Authentication configuration
const AUTH_ENABLED = process.env.AUTH_ENABLED !== 'false' && process.env.AUTH_ENABLED !== '0';
const AUTH_TOKEN = process.env.AUTH_TOKEN || process.env.API_TOKEN || 'change-me-in-production';
const AUTH_SECRET = process.env.AUTH_SECRET || AUTH_TOKEN; // JWT secret (can be same as token for simplicity)
const AUTH_ALLOW_IPS = process.env.AUTH_ALLOW_IPS || ''; // Comma-separated IPs/CIDR: "127.0.0.1,192.168.0.0/24"

// JWT configuration
const JWT_SECRET = process.env.JWT_SECRET || AUTH_SECRET; // Separate JWT secret (recommended)
const JWT_EXPIRES = process.env.JWT_EXPIRES || '1h'; // Access token expiration (default: 1 hour)
const JWT_REFRESH_EXPIRES = process.env.JWT_REFRESH_EXPIRES || '7d'; // Refresh token expiration (default: 7 days)

// IP Allowlist (blocks all other origins if enabled)
const ALLOWLIST = process.env.ALLOWLIST || ''; // Comma-separated IPs/CIDR: "192.168.0.0/24,10.0.0.1" or "*" to disable

// Rate limiting configuration
const RATE_LIMIT_LOGIN = parseInt(process.env.RATE_LIMIT_LOGIN) || 5; // Login attempts per window
const RATE_LIMIT_API = parseInt(process.env.RATE_LIMIT_API) || 100; // API requests per minute

// Parse allowed IPs
function parseAllowedIPs(ipString) {
  if (!ipString || ipString.trim() === '') {
    return [];
  }
  
  return ipString
    .split(',')
    .map(ip => ip.trim())
    .filter(ip => ip.length > 0);
}

// Check if IP matches allowlist (supports CIDR notation)
function isIPAllowed(clientIP, allowedIPs) {
  if (allowedIPs.length === 0) {
    return false; // No allowlist = no bypass
  }
  
  // Handle IPv4-mapped IPv6 addresses (::ffff:192.168.1.1)
  const cleanIP = clientIP.replace(/^::ffff:/, '');
  
  // Simple IP matching (exact match)
  if (allowedIPs.includes(cleanIP) || allowedIPs.includes(clientIP)) {
    return true;
  }
  
  // Basic CIDR matching (simplified - for production use a proper library like ipaddr.js)
  for (const allowed of allowedIPs) {
    if (allowed.includes('/')) {
      // CIDR notation - basic check
      const [network, prefixLength] = allowed.split('/');
      const prefix = parseInt(prefixLength, 10);
      
      if (isNaN(prefix) || prefix < 0 || prefix > 32) continue;
      
      // Convert IPv4 IPs to numbers for comparison
      const ipToNum = (ip) => {
        const parts = ip.split('.');
        if (parts.length !== 4) return null;
        return parts.reduce((acc, octet) => {
          const num = parseInt(octet, 10);
          if (isNaN(num) || num < 0 || num > 255) return null;
          return (acc << 8) + num;
        }, 0) >>> 0;
      };
      
      const networkNum = ipToNum(network);
      const clientNum = ipToNum(cleanIP);
      
      if (networkNum === null || clientNum === null) continue;
      
      const mask = (0xFFFFFFFF << (32 - prefix)) >>> 0;
      
      if ((networkNum & mask) === (clientNum & mask)) {
        return true;
      }
    }
  }
  
  return false;
}

// Parse allowlist (different from AUTH_ALLOW_IPS - this blocks all other origins)
function parseAllowlist(allowlistString) {
  if (!allowlistString || allowlistString.trim() === '' || allowlistString === '*') {
    return null; // null means allowlist is disabled
  }
  
  return parseAllowedIPs(allowlistString);
}

// Check if IP is in allowlist (returns true if allowlist is disabled)
function isIPInAllowlist(clientIP, allowlist) {
  if (allowlist === null) {
    return true; // Allowlist disabled - allow all
  }
  
  return isIPAllowed(clientIP, allowlist);
}

module.exports = {
  AUTH_ENABLED,
  AUTH_TOKEN,
  AUTH_SECRET,
  AUTH_ALLOW_IPS: parseAllowedIPs(AUTH_ALLOW_IPS),
  JWT_SECRET,
  JWT_EXPIRES,
  JWT_REFRESH_EXPIRES,
  ALLOWLIST: parseAllowlist(ALLOWLIST),
  isIPInAllowlist,
  RATE_LIMIT_LOGIN,
  RATE_LIMIT_API,
  isIPAllowed,
  nodeEnv,
};

