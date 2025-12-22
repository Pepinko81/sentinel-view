/**
 * Secure CORS Configuration
 * Explicit origin validation, methods, and headers for production security
 */

const config = require('./config');

/**
 * Get allowed origins based on environment
 * Production: Single origin from env var
 * Development: Allow localhost variants
 */
function getAllowedOrigins() {
  const corsOrigin = config.corsOrigin;
  
  if (config.nodeEnv === 'production') {
    // Production: Single origin, no wildcards
    if (!corsOrigin || corsOrigin === '*') {
      throw new Error('CORS_ORIGIN must be set to a specific origin in production (no wildcards)');
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
    // This enables frontend access from other computers in local network
    // Production mode will use strict allowlist (see below)
    if (config.nodeEnv !== 'production') {
      // Allow all origins in development (LAN access enabled)
      return callback(null, true);
    }
    
    // PRODUCTION MODE: Strict origin validation
    const allowedOrigins = getAllowedOrigins();
    
    // In production, require origin
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

