const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
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
const { streamFail2banLog, killAllTailProcesses } = require('./services/logStream');

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

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server
const wss = new WebSocketServer({ 
  server,
  path: '/ws/logs',
});

// Handle WebSocket connections
wss.on('connection', (ws, req) => {
  console.log('[WS] New log stream connection');
  
  // Simple authentication check (optional)
  // For now, allow all connections since we're behind system access
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message.toString());
      if (data.type === 'start') {
        streamFail2banLog(ws);
      }
    } catch (err) {
      console.error('[WS] Error handling message:', err);
    }
  });
  
  ws.on('error', (error) => {
    console.error('[WS] WebSocket error:', error);
  });
  
  // Auto-start log stream on connection
  streamFail2banLog(ws);
});

// Start server
const PORT = config.port;
const SERVER_HOST = config.serverHost;

server.listen(PORT, SERVER_HOST, () => {
  console.log(`🚀 Sentinel Backend API running on ${SERVER_HOST}:${PORT}`);
  console.log(`📊 Environment: ${config.nodeEnv}`);
  console.log(`🔒 Authentication: ${config.authToken ? 'Enabled' : 'Disabled (WARNING!)'}`);
  console.log(`🌐 CORS: ${config.nodeEnv === 'production' ? `Strict (${config.corsOrigin})` : 'Permissive (LAN access enabled)'}`);
  console.log(`🔧 WebSocket: ws://${SERVER_HOST}:${PORT}/ws/logs`);
  
  if (config.performance.monitoring) {
    console.log(`⚡ Performance monitoring: Enabled`);
  }
  
  console.log(`\n📝 API Endpoints:`);
  console.log(`   GET  /api/jails`);
  console.log(`   GET  /api/jails/:name`);
  console.log(`   POST /api/jails/:name/start`);
  console.log(`   POST /api/jails/:name/stop`);
  console.log(`   GET  /api/jails/:name/bans`);
  console.log(`   GET  /api/bans`);
  console.log(`   GET  /api/bans/history`);
  console.log(`   POST /api/bans/unban`);
  console.log(`   POST /api/filters/create`);
  console.log(`   GET  /api/jail-config/:name`);
  console.log(`   POST /api/jail-config/:name`);
  console.log(`   POST /api/system/restart`);
  console.log(`   WS   /ws/logs (WebSocket log stream)`);
});

// Graceful shutdown handler
let isShuttingDown = false;
let shutdownTimer = null;

function forceExit() {
  console.log('⚠️  Forcing exit after timeout');
  process.exit(1);
}

async function gracefulShutdown(signal) {
  // Prevent multiple shutdown attempts
  if (isShuttingDown) {
    console.log('⚠️  Shutdown already in progress, forcing exit...');
    process.exit(1);
    return;
  }
  
  isShuttingDown = true;
  console.log(`\n🛑 ${signal} received, shutting down gracefully...`);
  
  // Set force exit timer (max 3 seconds total)
  shutdownTimer = setTimeout(forceExit, 3000);
  
  // Kill all active tail processes immediately (most important)
  killAllTailProcesses();
  
  // Close all active WebSocket connections immediately
  wss.clients.forEach((ws) => {
    try {
      if (ws.readyState === ws.OPEN || ws.readyState === ws.CONNECTING) {
        ws.terminate(); // Force close, don't wait
      }
    } catch (err) {
      // Ignore errors
    }
  });
  
  // Close WebSocket server
  try {
    wss.close(() => {
      console.log('✓ WebSocket server closed');
    });
  } catch (err) {
    // Ignore errors
  }
  
  // Close HTTP server (stop accepting new connections)
  server.close(() => {
    console.log('✓ HTTP server closed');
    clearTimeout(shutdownTimer);
    console.log('✓ Graceful shutdown complete');
    process.exit(0);
  });
  
  // Force exit if server.close doesn't complete in time
  // (This should not happen, but safety net)
  setTimeout(() => {
    if (!server.listening) {
      clearTimeout(shutdownTimer);
      console.log('✓ Graceful shutdown complete (timeout)');
      process.exit(0);
    }
  }, 1000);
}

// Handle shutdown signals - use once() to prevent multiple handlers
process.once('SIGTERM', () => {
  gracefulShutdown('SIGTERM').catch(() => {
    process.exit(1);
  });
});

process.once('SIGINT', () => {
  gracefulShutdown('SIGINT').catch(() => {
    process.exit(1);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  gracefulShutdown('uncaughtException').catch(() => {
    process.exit(1);
  });
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection').catch(() => {
    process.exit(1);
  });
});

module.exports = app;
