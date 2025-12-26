const rateLimit = require('express-rate-limit');
const config = require('../config/config');
const env = require('../config/env');

/**
 * Per-IP rate limiter for API endpoints
 * Tracks requests per IP address to prevent DoS attacks
 * and reduce system load from excessive sudo calls
 */
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: env.RATE_LIMIT_API, // Configurable via RATE_LIMIT_API env var (default: 100)
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false, // Disable `X-RateLimit-*` headers
  keyGenerator: (req) => {
    // Use IP address for per-IP limiting
    // This ensures each client has their own rate limit counter
    return req.ip || 
           req.connection.remoteAddress || 
           req.socket.remoteAddress ||
           (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
           'unknown';
  },
  message: {
    error: 'Too many requests from this IP, please try again later.',
    code: 'RATE_LIMIT_EXCEEDED',
  },
  // Don't skip successful requests - count all requests
  skipSuccessfulRequests: false,
  // Don't skip failed requests - count all requests
  skipFailedRequests: false,
  // Handler for when limit is exceeded
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too many requests from this IP, please try again later.',
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfter: 60, // seconds
    });
  },
});

/**
 * Stricter rate limiter for login endpoint (fail2ban-style)
 * Prevents brute force attacks
 */
const loginLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: env.RATE_LIMIT_LOGIN, // Configurable via RATE_LIMIT_LOGIN env var (default: 5)
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.ip || 
           req.connection.remoteAddress || 
           req.socket.remoteAddress ||
           (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
           'unknown';
  },
  message: {
    error: 'Too many login attempts. Please try again later.',
    code: 'LOGIN_RATE_LIMIT_EXCEEDED',
  },
  skipSuccessfulRequests: true, // Don't count successful logins
  skipFailedRequests: false, // Count failed login attempts
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too many login attempts from this IP. Please try again in 10 minutes.',
      code: 'LOGIN_RATE_LIMIT_EXCEEDED',
      retryAfter: 600, // 10 minutes in seconds
    });
  },
});

/**
 * Stricter rate limiter for backup endpoint
 * Backup operations are more resource-intensive
 */
const backupLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs * 5, // 5 minutes
  max: 5, // Only 5 backup requests per 5 minutes
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.ip || 
           req.connection.remoteAddress || 
           req.socket.remoteAddress ||
           (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
           'unknown';
  },
  message: {
    error: 'Too many backup requests. Please wait before trying again.',
    code: 'BACKUP_RATE_LIMIT_EXCEEDED',
  },
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too many backup requests. Please wait before trying again.',
      code: 'BACKUP_RATE_LIMIT_EXCEEDED',
      retryAfter: Math.ceil((config.rateLimit.windowMs * 5) / 1000), // seconds
    });
  },
});

module.exports = {
  apiLimiter,
  backupLimiter,
  loginLimiter,
};

