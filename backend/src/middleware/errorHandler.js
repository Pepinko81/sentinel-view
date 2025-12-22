/**
 * Centralized error handling middleware
 */
function errorHandler(err, req, res, next) {
  console.error('Error:', err);
  
  // Don't leak error details in production
  const isDevelopment = process.env.NODE_ENV === 'development';
  
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

