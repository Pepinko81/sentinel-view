const express = require('express');
const router = express.Router();
const { handleLogin, handleLogout, handleRefresh, checkAuth } = require('../middleware/auth');
const { loginLimiter } = require('../middleware/rateLimiter');
const { checkLockout, recordFailedAttempt, recordSuccessfulLogin } = require('../middleware/bruteForce');
const { getClientIP } = require('../middleware/allowlist');

// Login endpoint with rate limiting and brute force protection
router.post('/', loginLimiter, checkLockout, (req, res, next) => {
  const ip = getClientIP(req);
  
  // Wrap handleLogin to track attempts
  const originalJson = res.json.bind(res);
  res.json = function(data) {
    if (data.success) {
      recordSuccessfulLogin(ip);
    } else if (data.error && (data.code === 'AUTH_INVALID_PASSWORD' || data.code === 'PASSWORD_REQUIRED')) {
      recordFailedAttempt(ip);
    }
    return originalJson(data);
  };
  
  // Call login handler
  handleLogin(req, res);
});

// Refresh token endpoint
router.post('/refresh', handleRefresh);

// Logout endpoint  
router.post('/logout', handleLogout);

// Check auth status
router.get('/status', checkAuth);

module.exports = router;

