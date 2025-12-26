/**
 * Centralized error handling middleware
 * Note: CORS headers must be set before sending error response
 */
function errorHandler(err, req, res, next) {
  console.error('Error:', err);
  
  // Don't leak error details in production
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  // Set CORS headers even on errors (if not already set)
  // This ensures frontend can read error responses
  if (!res.headersSent) {
    const origin = req.headers.origin;
    const nodeEnv = process.env.NODE_ENV || 'development';
    
    // In development, allow all origins (including LAN IPs)
    if (nodeEnv !== 'production') {
      if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
      } else {
        // Allow requests without origin in development
        res.setHeader('Access-Control-Allow-Origin', '*');
      }
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-API-Version');
    } else if (origin) {
      // Production: check against allowed origins
      const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173';
      const allowedOrigins = [
        corsOrigin,
        'http://localhost:5173',
        'http://localhost:3000',
        'http://localhost:3010',
        'http://localhost:5174',
        'http://localhost:8080',
        'http://127.0.0.1:5173',
        'http://127.0.0.1:3000',
        'http://127.0.0.1:3010',
        'http://127.0.0.1:8080',
      ];
      
      if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
      }
    }
  }
  
  // Handle specific error types
  if (err.code === 'ETIMEDOUT') {
    return res.status(504).json({
      error: 'Request timeout',
      code: 'TIMEOUT',
    });
  }
  
  if (err.code === 'ENOENT') {
    return res.status(404).json({
      error: 'Resource not found',
      code: 'NOT_FOUND',
    });
  }
  
  // Default error response
  res.status(err.status || err.statusCode || 500).json({
    error: err.message || 'Internal server error',
    code: err.code || 'INTERNAL_ERROR',
    ...(isDevelopment && { stack: err.stack }),
  });
}

module.exports = {
  errorHandler,
};

