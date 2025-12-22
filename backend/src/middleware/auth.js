const config = require('../config/config');

/**
 * Bearer token authentication middleware
 * Expects: Authorization: Bearer <token>
 */
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return res.status(401).json({
      error: 'Authentication required',
      code: 'AUTH_REQUIRED',
    });
  }
  
  // Extract token from "Bearer <token>" format
  const parts = authHeader.split(' ');
  
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return res.status(401).json({
      error: 'Invalid authorization format. Expected: Bearer <token>',
      code: 'AUTH_INVALID_FORMAT',
    });
  }
  
  const token = parts[1];
  
  if (!token || token !== config.authToken) {
    return res.status(401).json({
      error: 'Invalid authentication token',
      code: 'AUTH_INVALID_TOKEN',
    });
  }
  
  next();
}

module.exports = {
  authenticate,
};

