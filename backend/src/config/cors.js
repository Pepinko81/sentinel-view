/**
 * Secure CORS Configuration
 * Explicit origin validation, methods, and headers for production security
 */

const config = require('./config');

/**
 * Get allowed origins based on environment
 * Production: Auto-detect LAN access (if SERVER_HOST=0.0.0.0) or use strict origin
 * Development: Allow localhost variants
 */
function getAllowedOrigins() {
  const corsOrigin = config.corsOrigin;
  
  if (config.nodeEnv === 'production') {
    // Production: Check if LAN access is enabled (SERVER_HOST=0.0.0.0)
    if (config.serverHost === '0.0.0.0') {
      // LAN access enabled - allow all origins
      return true; // Allow all origins
    }
    
    // Production with strict binding: Single origin, no wildcards
    if (!corsOrigin || corsOrigin === '*') {
      throw new Error('CORS_ORIGIN must be set to a specific origin in production when SERVER_HOST is not 0.0.0.0');
    }
    return [corsOrigin];
  }
  
  // Development: Allow localhost variants
  const localhostOrigins = [
    'http://localhost:5173',  // Vite default
    'http://localhost:3000',   // Common React dev server
    'http://localhost:5174',   // Vite alternative port
    'http://localhost:8080',   // Alternative Vite port
    'http://127.0.0.1:5173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:8080',
  ];
  
  // Add custom origin if provided
  if (corsOrigin && corsOrigin !== '*' && !localhostOrigins.includes(corsOrigin)) {
    localhostOrigins.push(corsOrigin);
  }
  
  return localhostOrigins;
}

/**
 * CORS configuration options
 */
const corsOptions = {
  origin: function (origin, callback) {
    // DEVELOPMENT MODE: Allow all origins (including LAN IPs)
    if (config.nodeEnv !== 'production') {
      // Allow all origins in development (LAN access enabled)
      return callback(null, true);
    }
    
    // PRODUCTION MODE: Check if LAN access is enabled
    const allowedOrigins = getAllowedOrigins();
    
    // If getAllowedOrigins returns true, allow all origins (LAN access enabled)
    if (allowedOrigins === true) {
      return callback(null, true);
    }
    
    // Strict origin validation (SERVER_HOST=127.0.0.1)
    // In production with strict binding, require origin
    if (!origin) {
      return callback(new Error('CORS: Origin header required in production'));
    }
    
    // Check if origin is allowed
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: Origin ${origin} is not allowed`));
    }
  },
  
  // Allowed HTTP methods
  methods: ['GET', 'POST', 'OPTIONS'],
  
  // Allowed headers
  allowedHeaders: [
    'Authorization',
    'Content-Type',
    'X-API-Version',
  ],
  
  // Exposed headers (available to frontend)
  exposedHeaders: [
    'X-API-Version',
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset',
  ],
  
  // Allow credentials (cookies, authorization headers)
  credentials: true,
  
  // Cache preflight requests for 24 hours
  maxAge: 86400, // 24 hours
  
  // Enable preflight continuation (for complex requests)
  preflightContinue: false,
  
  // Success status for preflight (204 No Content)
  optionsSuccessStatus: 204,
};

module.exports = corsOptions;

