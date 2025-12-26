const jwt = require('jsonwebtoken');
const env = require('../config/env');

/**
 * JWT-based authentication middleware with cookie support
 * Supports:
 * - HttpOnly cookies for token storage
 * - IP allowlist bypass (AUTH_ALLOW_IPS)
 * - 24h token expiration
 */

// Generate JWT access token (short-lived)
function generateToken(payload) {
  return jwt.sign(
    payload,
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRES }
  );
}

// Generate JWT refresh token (long-lived, stored in httpOnly cookie)
function generateRefreshToken(payload) {
  return jwt.sign(
    { ...payload, type: 'refresh' },
    env.JWT_SECRET,
    { expiresIn: env.JWT_REFRESH_EXPIRES }
  );
}

// Verify JWT token
function verifyToken(token) {
  try {
    return jwt.verify(token, env.JWT_SECRET);
  } catch (err) {
    return null;
  }
}

// Verify refresh token (checks type)
function verifyRefreshToken(token) {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET);
    if (decoded.type !== 'refresh') {
      return null; // Not a refresh token
    }
    return decoded;
  } catch (err) {
    return null;
  }
}

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
 * Main authentication middleware
 * Checks for token in:
 * 1. HttpOnly cookie (preferred)
 * 2. Authorization Bearer header (fallback)
 */
function requireAuth(req, res, next) {
  // If auth is disabled, skip
  if (!env.AUTH_ENABLED) {
    return next();
  }

  // Check IP allowlist bypass
  const clientIP = getClientIP(req);
  if (env.AUTH_ALLOW_IPS.length > 0 && env.isIPAllowed(clientIP, env.AUTH_ALLOW_IPS)) {
    // IP is in allowlist - bypass auth
    return next();
  }

  // Get token from cookie (preferred) or Authorization header (fallback)
  let token = req.cookies?.authToken || req.cookies?.token;
  
  if (!token) {
    // Try Authorization header as fallback
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
  }

  if (!token) {
    return res.status(401).json({
      error: 'Authentication required',
      code: 'AUTH_REQUIRED',
    });
  }

  // Verify token
  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({
      error: 'Invalid or expired token',
      code: 'AUTH_INVALID_TOKEN',
    });
  }

  // Attach user info to request
  req.user = decoded;
  next();
}

/**
 * Login handler - validates password and sets cookie
 */
function handleLogin(req, res) {
  const { password } = req.body;

  if (!password) {
    return res.status(400).json({
      error: 'Password is required',
      code: 'PASSWORD_REQUIRED',
    });
  }

  // Validate password against AUTH_TOKEN
  if (password !== env.AUTH_TOKEN) {
    return res.status(401).json({
      error: 'Invalid password',
      code: 'AUTH_INVALID_PASSWORD',
    });
  }

  // Generate access token (short-lived)
  const token = generateToken({
    authenticated: true,
    timestamp: Date.now(),
  });

  // Generate refresh token (long-lived, stored in httpOnly cookie)
  const refreshToken = generateRefreshToken({
    authenticated: true,
    timestamp: Date.now(),
  });

  // In cross-site scenarios without HTTPS, cookies with sameSite: 'lax' are blocked
  // Solution: Don't set cookie in cross-site HTTP scenarios, use Authorization header instead
  const isProduction = process.env.NODE_ENV === 'production';
  const isHTTPS = req.protocol === 'https' || req.headers['x-forwarded-proto'] === 'https';
  const origin = req.headers.origin;
  const host = req.get('host');
  
  // Determine if this is a same-origin request
  let isSameOrigin = false;
  if (origin && host) {
    const originHost = new URL(origin).host;
    const requestHost = host.split(':')[0]; // Remove port if present
    isSameOrigin = originHost === host || originHost === requestHost;
  }
  
  // Set refresh token in httpOnly cookie (always set if possible)
  if (isHTTPS || isSameOrigin) {
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: isHTTPS || isProduction,
      sameSite: isHTTPS ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/',
      domain: undefined,
    });
    
    // Also set access token in cookie for convenience (short-lived)
    res.cookie('authToken', token, {
      httpOnly: true,
      secure: isHTTPS || isProduction,
      sameSite: isHTTPS ? 'none' : 'lax',
      maxAge: 60 * 60 * 1000, // 1 hour
      path: '/',
      domain: undefined,
    });
  }
  
  // ALWAYS return access token in response body
  // Frontend will use this in Authorization header (required for cross-site HTTP scenarios)
  return res.json({
    success: true,
    message: 'Authentication successful',
    token: token, // Access token for Authorization header
    expiresIn: 3600, // 1 hour in seconds
  });
}

/**
 * Refresh token handler - generates new access token from refresh token
 */
function handleRefresh(req, res) {
  // Get refresh token from cookie
  let refreshToken = req.cookies?.refreshToken;
  
  if (!refreshToken) {
    return res.status(401).json({
      error: 'Refresh token required',
      code: 'REFRESH_TOKEN_REQUIRED',
    });
  }

  // Verify refresh token
  const decoded = verifyRefreshToken(refreshToken);
  if (!decoded) {
    // Clear invalid refresh token
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    });
    
    return res.status(401).json({
      error: 'Invalid or expired refresh token',
      code: 'REFRESH_TOKEN_INVALID',
    });
  }

  // Generate new access token
  const newToken = generateToken({
    authenticated: true,
    timestamp: Date.now(),
  });

  // Set new access token in cookie if possible
  const isProduction = process.env.NODE_ENV === 'production';
  const isHTTPS = req.protocol === 'https' || req.headers['x-forwarded-proto'] === 'https';
  const origin = req.headers.origin;
  const host = req.get('host');
  
  let isSameOrigin = false;
  if (origin && host) {
    const originHost = new URL(origin).host;
    const requestHost = host.split(':')[0];
    isSameOrigin = originHost === host || originHost === requestHost;
  }

  if (isHTTPS || isSameOrigin) {
    res.cookie('authToken', newToken, {
      httpOnly: true,
      secure: isHTTPS || isProduction,
      sameSite: isHTTPS ? 'none' : 'lax',
      maxAge: 60 * 60 * 1000, // 1 hour
      path: '/',
      domain: undefined,
    });
  }

  return res.json({
    success: true,
    token: newToken,
    expiresIn: 3600,
  });
}

/**
 * Logout handler - clears cookies
 */
function handleLogout(req, res) {
  const isProduction = process.env.NODE_ENV === 'production';
  res.clearCookie('authToken', {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    domain: undefined,
  });
  
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    domain: undefined,
  });

  return res.json({
    success: true,
    message: 'Logged out successfully',
  });
}

/**
 * Check auth status
 */
function checkAuth(req, res) {
  if (!env.AUTH_ENABLED) {
    return res.json({ authenticated: false, authEnabled: false });
  }

  const clientIP = getClientIP(req);
  const isIPAllowed = env.AUTH_ALLOW_IPS.length > 0 && 
                      env.isIPAllowed(clientIP, env.AUTH_ALLOW_IPS);

  if (isIPAllowed) {
    return res.json({ authenticated: true, authEnabled: true, bypass: 'ip' });
  }

  // Check for token in cookie first, then Authorization header
  let token = req.cookies?.authToken || req.cookies?.token;
  
  if (!token) {
    // Try Authorization header (required for cross-site scenarios)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
  }

  if (!token) {
    return res.json({ authenticated: false, authEnabled: true });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.json({ authenticated: false, authEnabled: true });
  }

  return res.json({ authenticated: true, authEnabled: true });
}

module.exports = {
  requireAuth,
  handleLogin,
  handleLogout,
  handleRefresh,
  checkAuth,
  generateToken,
  generateRefreshToken,
  verifyToken,
  verifyRefreshToken,
};
