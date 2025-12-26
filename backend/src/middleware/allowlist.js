const env = require('../config/env');

/**
 * IP Allowlist Middleware
 * Blocks all requests from IPs not in the allowlist
 * Set ALLOWLIST=* to disable (allow all)
 * Set ALLOWLIST=192.168.0.0/24,10.0.0.1 to restrict access
 */

// Get client IP address
function getClientIP(req) {
  return (
    req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
    req.headers['x-real-ip'] ||
    req.connection?.remoteAddress ||
    req.socket?.remoteAddress ||
    req.ip ||
    'unknown'
  );
}

/**
 * Allowlist middleware - blocks requests from non-allowlisted IPs
 */
function requireAllowlist(req, res, next) {
  // If allowlist is disabled (null), allow all
  if (env.ALLOWLIST === null) {
    return next();
  }

  const clientIP = getClientIP(req);
  
  // Check if IP is in allowlist
  if (!env.isIPInAllowlist(clientIP, env.ALLOWLIST)) {
    return res.status(403).json({
      error: 'Access denied: IP address not in allowlist',
      code: 'IP_NOT_ALLOWLISTED',
      ip: clientIP,
    });
  }

  next();
}

module.exports = {
  requireAllowlist,
  getClientIP,
};

