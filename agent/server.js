#!/usr/bin/env node
/**
 * Sentinel Agent Server
 * Lightweight HTTP server for receiving action commands from HQ
 */

const http = require('http');
const { exec } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG_FILE = path.join(__dirname, 'config.json');
const DEFAULT_PORT = 4040;
const DEFAULT_HOST = '0.0.0.0';

let config = null;
let server = null;

/**
 * Load configuration
 */
function loadConfig() {
  try {
    const configData = fs.readFileSync(CONFIG_FILE, 'utf8');
    config = JSON.parse(configData);
    
    if (!config.secret) {
      console.error('ERROR: secret not found in config.json');
      process.exit(1);
    }
    
    return config;
  } catch (err) {
    console.error('ERROR: Failed to load config.json:', err.message);
    process.exit(1);
  }
}

/**
 * Verify HMAC signature
 */
function verifySignature(body, signature, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(JSON.stringify(body));
  const expectedSignature = hmac.digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

/**
 * Execute command with sudo
 */
function executeCommand(command, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const fullCommand = `sudo ${command}`;
    
    exec(fullCommand, { timeout }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

/**
 * Handle action requests
 */
async function handleAction(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'Method not allowed' }));
    return;
  }

  // Read request body
  let body = '';
  req.on('data', chunk => {
    body += chunk.toString();
  });

  req.on('end', async () => {
    try {
      const payload = JSON.parse(body);
      const { action, params } = payload;
      
      // Get signature from header
      const signature = req.headers['x-signature'];
      
      if (!signature) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Missing x-signature header' }));
        return;
      }

      // Verify signature
      if (!verifySignature({ action, params }, signature, config.secret)) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: 'Invalid signature' }));
        return;
      }

      // Execute action
      let result;
      let command;

      switch (action) {
        case 'restart_fail2ban':
          command = 'systemctl restart fail2ban';
          break;

        case 'unban':
          if (!params || !params.ip || !params.jail) {
            throw new Error('Missing params: ip and jail required');
          }
          command = `fail2ban-client set ${params.jail} unbanip ${params.ip}`;
          break;

        case 'start':
          if (!params || !params.jail) {
            throw new Error('Missing params: jail required');
          }
          command = `fail2ban-client start ${params.jail}`;
          break;

        case 'stop':
          if (!params || !params.jail) {
            throw new Error('Missing params: jail required');
          }
          command = `fail2ban-client stop ${params.jail}`;
          break;

        default:
          throw new Error(`Unknown action: ${action}`);
      }

      console.log(`[AGENT] Executing: ${command}`);
      result = await executeCommand(command);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        ok: true, 
        result, 
        executedAt: Date.now(),
        serverId: config.serverId 
      }));

    } catch (err) {
      console.error('[AGENT] Action failed:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
  });
}

/**
 * Health check endpoint
 */
function handleHealth(req, res) {
  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'Method not allowed' }));
    return;
  }

  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ ok: true, status: 'healthy', timestamp: Date.now() }));
}

/**
 * Start server
 */
function startServer() {
  config = loadConfig();
  const port = config.listenPort || config.port || DEFAULT_PORT;
  const host = config.host || DEFAULT_HOST;

  server = http.createServer((req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-signature');

    if (req.method === 'OPTIONS') {
      res.writeHead(200);
      res.end();
      return;
    }

    // Route requests
    if (req.url === '/api/action' || req.url === '/api/action/') {
      handleAction(req, res);
    } else if (req.url === '/health' || req.url === '/health/') {
      handleHealth(req, res);
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: 'Not found' }));
    }
  });

  server.listen(port, host, () => {
    console.log(`[AGENT] Server listening on ${host}:${port}`);
  });

  server.on('error', (err) => {
    console.error('[AGENT] Server error:', err);
    process.exit(1);
  });
}

// Handle shutdown
process.on('SIGTERM', () => {
  console.log('[AGENT] SIGTERM received, shutting down...');
  if (server) {
    server.close(() => {
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
});

process.on('SIGINT', () => {
  console.log('[AGENT] SIGINT received, shutting down...');
  if (server) {
    server.close(() => {
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
});

// Start server
startServer();

