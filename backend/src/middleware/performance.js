/**
 * Performance Monitoring Middleware
 * Tracks response times and logs slow requests
 */

const config = require('../config/config');

// Performance thresholds (ms)
const SLOW_REQUEST_THRESHOLD = 300;
const VERY_SLOW_REQUEST_THRESHOLD = 1000;

// Performance stats (in-memory, reset on restart)
const performanceStats = {
  requests: 0,
  slowRequests: 0,
  verySlowRequests: 0,
  totalResponseTime: 0,
  byEndpoint: {},
};

/**
 * Performance monitoring middleware
 * Only enabled in development or if explicitly enabled
 */
function performanceMonitor(req, res, next) {
  // Skip if not enabled
  if (config.nodeEnv === 'production' && !config.performanceMonitoring) {
    return next();
  }
  
  const startTime = Date.now();
  const endpoint = req.path;
  
  // Track original end function
  const originalEnd = res.end;
  
  // Override end to capture response time
  res.end = function (...args) {
    const responseTime = Date.now() - startTime;
    
    // Update stats
    performanceStats.requests++;
    performanceStats.totalResponseTime += responseTime;
    
    // Track by endpoint
    if (!performanceStats.byEndpoint[endpoint]) {
      performanceStats.byEndpoint[endpoint] = {
        count: 0,
        totalTime: 0,
        slowCount: 0,
      };
    }
    
    const endpointStats = performanceStats.byEndpoint[endpoint];
    endpointStats.count++;
    endpointStats.totalTime += responseTime;
    
    // Log slow requests
    if (responseTime >= VERY_SLOW_REQUEST_THRESHOLD) {
      performanceStats.verySlowRequests++;
      endpointStats.slowCount++;
      console.warn(`🐌 VERY SLOW REQUEST: ${req.method} ${endpoint} - ${responseTime}ms`);
    } else if (responseTime >= SLOW_REQUEST_THRESHOLD) {
      performanceStats.slowRequests++;
      endpointStats.slowCount++;
      console.warn(`⚠️  SLOW REQUEST: ${req.method} ${endpoint} - ${responseTime}ms`);
    }
    
    // Add response time header (for debugging)
    if (config.nodeEnv === 'development') {
      res.setHeader('X-Response-Time', `${responseTime}ms`);
    }
    
    // Call original end
    originalEnd.apply(res, args);
  };
  
  next();
}

/**
 * Get performance statistics
 */
function getStats() {
  const avgResponseTime = performanceStats.requests > 0
    ? Math.round(performanceStats.totalResponseTime / performanceStats.requests)
    : 0;
  
  const endpointStats = Object.entries(performanceStats.byEndpoint).map(([endpoint, stats]) => ({
    endpoint,
    count: stats.count,
    avgTime: stats.count > 0 ? Math.round(stats.totalTime / stats.count) : 0,
    slowCount: stats.slowCount,
    slowPercentage: stats.count > 0 ? Math.round((stats.slowCount / stats.count) * 100) : 0,
  }));
  
  return {
    totalRequests: performanceStats.requests,
    slowRequests: performanceStats.slowRequests,
    verySlowRequests: performanceStats.verySlowRequests,
    avgResponseTime,
    endpointStats,
  };
}

/**
 * Reset performance statistics
 */
function resetStats() {
  performanceStats.requests = 0;
  performanceStats.slowRequests = 0;
  performanceStats.verySlowRequests = 0;
  performanceStats.totalResponseTime = 0;
  performanceStats.byEndpoint = {};
}

module.exports = {
  performanceMonitor,
  getStats,
  resetStats,
};

