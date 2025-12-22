const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const config = require('./config/config');
const corsOptions = require('./config/cors');
const { authenticate } = require('./middleware/auth');
const { errorHandler } = require('./middleware/errorHandler');
const { performanceMonitor } = require('./middleware/performance');
const { apiLimiter, backupLimiter } = require('./middleware/rateLimiter');
const healthRoutes = require('./routes/health');
const apiRoutes = require('./routes');

// Validate configuration on startup (fail fast if secrets missing)
config.validate();

const app = express();

// Security middleware
app.use(helmet());

// CORS configuration (secure, explicit origins)
app.use(cors(corsOptions));

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Performance monitoring (if enabled)
if (config.performance.monitoring) {
  app.use(performanceMonitor);
}

// Rate limiting - per-IP tracking
// This prevents DoS attacks and reduces system load from excessive sudo calls
app.use('/api', apiLimiter);

// Health check endpoint (no auth required, comprehensive status)
app.use('/health', healthRoutes);

// API routes (require authentication)
app.use('/api', authenticate, apiRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    code: 'NOT_FOUND',
    path: req.path,
  });
});

// Error handling middleware (must be last)
app.use(errorHandler);

// Start server
const PORT = config.port;
// Network binding: 0.0.0.0 in development (LAN access), configurable in production
const SERVER_HOST = process.env.SERVER_HOST || (config.nodeEnv === 'production' ? '127.0.0.1' : '0.0.0.0');

app.listen(PORT, SERVER_HOST, () => {
  console.log(`🚀 Sentinel Backend API running on ${SERVER_HOST}:${PORT}`);
  console.log(`📊 Environment: ${config.nodeEnv}`);
  console.log(`🔒 Authentication: ${config.authToken ? 'Enabled' : 'Disabled (WARNING!)'}`);
  console.log(`📁 Scripts directory: ${config.scriptsDir || '(not configured)'}`);
  console.log(`🌐 CORS: ${config.nodeEnv === 'production' ? `Strict (${config.corsOrigin})` : 'Permissive (LAN access enabled)'}`);
  console.log(`🔧 Fail2ban available: ${config.fail2banAvailable ? 'Yes' : 'No'}`);
  
  if (config.performance.monitoring) {
    console.log(`⚡ Performance monitoring: Enabled`);
  }
  
  if (config.nodeEnv === 'development') {
    console.log(`\n📝 API Endpoints:`);
    console.log(`   GET  /health (enhanced health check)`);
    console.log(`   GET  /api/overview (optimized for <300ms)`);
    console.log(`   GET  /api/jails`);
    console.log(`   GET  /api/jails/:name`);
    console.log(`   GET  /api/nginx`);
    console.log(`   GET  /api/system`);
    console.log(`   POST /api/backup`);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  process.exit(0);
});

module.exports = app;
