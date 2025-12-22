const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const config = require('./config/config');
const { authenticate } = require('./middleware/auth');
const { errorHandler } = require('./middleware/errorHandler');
const { apiLimiter, backupLimiter } = require('./middleware/rateLimiter');
const apiRoutes = require('./routes');

// Validate configuration on startup (fail fast if secrets missing)
config.validate();

const app = express();

// Security middleware
app.use(helmet());

// CORS configuration
app.use(cors({
  origin: config.corsOrigin,
  credentials: true,
}));

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting - per-IP tracking
// This prevents DoS attacks and reduces system load from excessive sudo calls
app.use('/api', apiLimiter);

// Health check endpoint (no auth required)
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

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
app.listen(PORT, () => {
  console.log(`🚀 Sentinel Backend API running on port ${PORT}`);
  console.log(`📊 Environment: ${config.nodeEnv}`);
  console.log(`🔒 Authentication: ${config.authToken ? 'Enabled' : 'Disabled (WARNING!)'}`);
  console.log(`📁 Scripts directory: ${config.scriptsDir}`);
  
  if (config.nodeEnv === 'development') {
    console.log(`\n📝 API Endpoints:`);
    console.log(`   GET  /health`);
    console.log(`   GET  /api/overview`);
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

