const env = require('../config/env');

/**
 * Brute Force Protection
 * Tracks failed login attempts and locks out users/IPs after threshold
 */

// In-memory store for failed login attempts
// In production, consider using Redis for distributed systems
const failedAttempts = new Map(); // IP -> { count: number, firstAttempt: timestamp, lockedUntil: timestamp }
const lockedIPs = new Map(); // IP -> lockedUntil timestamp

// Configuration
const MAX_FAILED_ATTEMPTS = 5; // Lock after 5 failed attempts
const LOCKOUT_DURATION = 15 * 60 * 1000; // 15 minutes lockout
const WINDOW_MS = 10 * 60 * 1000; // 10 minute window for counting attempts

/**
 * Record a failed login attempt
 */
function recordFailedAttempt(ip) {
  const now = Date.now();
  const record = failedAttempts.get(ip) || { count: 0, firstAttempt: now };
  
  // Reset if window expired
  if (now - record.firstAttempt > WINDOW_MS) {
    record.count = 1;
    record.firstAttempt = now;
  } else {
    record.count++;
  }
  
  failedAttempts.set(ip, record);
  
  // Lock if threshold exceeded
  if (record.count >= MAX_FAILED_ATTEMPTS) {
    const lockedUntil = now + LOCKOUT_DURATION;
    lockedIPs.set(ip, lockedUntil);
    console.warn(`[BRUTE FORCE] IP ${ip} locked out until ${new Date(lockedUntil).toISOString()}`);
    
    // Clean up old record
    setTimeout(() => {
      failedAttempts.delete(ip);
    }, WINDOW_MS);
  }
  
  // Clean up lockout after duration
  if (lockedIPs.has(ip)) {
    setTimeout(() => {
      lockedIPs.delete(ip);
      failedAttempts.delete(ip);
      console.log(`[BRUTE FORCE] IP ${ip} lockout expired`);
    }, LOCKOUT_DURATION);
  }
}

/**
 * Record a successful login (reset counter)
 */
function recordSuccessfulLogin(ip) {
  failedAttempts.delete(ip);
  lockedIPs.delete(ip);
}

/**
 * Check if IP is locked out
 */
function isLockedOut(ip) {
  const lockedUntil = lockedIPs.get(ip);
  if (!lockedUntil) {
    return false;
  }
  
  if (Date.now() < lockedUntil) {
    return true;
  }
  
  // Lockout expired, clean up
  lockedIPs.delete(ip);
  return false;
}

/**
 * Get remaining lockout time in seconds
 */
function getRemainingLockoutTime(ip) {
  const lockedUntil = lockedIPs.get(ip);
  if (!lockedUntil) {
    return 0;
  }
  
  const remaining = Math.ceil((lockedUntil - Date.now()) / 1000);
  return remaining > 0 ? remaining : 0;
}

/**
 * Get failed attempt count for IP
 */
function getFailedAttemptCount(ip) {
  const record = failedAttempts.get(ip);
  return record ? record.count : 0;
}

/**
 * Middleware to check if IP is locked out
 */
function checkLockout(req, res, next) {
  const ip = req.ip || 
             req.connection?.remoteAddress || 
             req.socket?.remoteAddress ||
             (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
             'unknown';
  
  if (isLockedOut(ip)) {
    const remaining = getRemainingLockoutTime(ip);
    return res.status(429).json({
      error: 'Too many failed login attempts. Account temporarily locked.',
      code: 'ACCOUNT_LOCKED',
      retryAfter: remaining,
      message: `Please try again in ${Math.ceil(remaining / 60)} minute(s)`,
    });
  }
  
  next();
}

// Cleanup old records periodically (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of failedAttempts.entries()) {
    if (now - record.firstAttempt > WINDOW_MS) {
      failedAttempts.delete(ip);
    }
  }
}, 5 * 60 * 1000);

module.exports = {
  recordFailedAttempt,
  recordSuccessfulLogin,
  isLockedOut,
  getRemainingLockoutTime,
  getFailedAttemptCount,
  checkLockout,
};

