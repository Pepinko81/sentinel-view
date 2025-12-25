const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const config = require('../config/config');

const SUDO_PATH = process.env.SUDO_PATH || '/usr/bin/sudo';
const TAIL_PATH = process.env.TAIL_PATH || '/usr/bin/tail';

// Track active tail processes for graceful shutdown
const activeTailProcesses = new Set();

/**
 * Stream fail2ban log file via tail -F
 * @param {WebSocket} ws - WebSocket connection
 */
function streamFail2banLog(ws) {
  const logPath = config.fail2ban.log;
  
  // Check if log file exists
  if (!fs.existsSync(logPath)) {
    ws.send(JSON.stringify({
      type: 'error',
      message: `Log file not found: ${logPath}`,
    }));
    ws.close();
    return;
  }
  
  // Spawn tail -F process with sudo
  const tailProcess = spawn(SUDO_PATH, [TAIL_PATH, '-F', '-n', '100', logPath], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  
  // Track this process
  activeTailProcesses.add(tailProcess);
  
  let buffer = '';
  
  // Handle stdout (log lines)
  tailProcess.stdout.on('data', (data) => {
    buffer += data.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() || ''; // Keep incomplete line in buffer
    
    lines.forEach(line => {
      if (line.trim()) {
        try {
          ws.send(JSON.stringify({
            type: 'log',
            line: line.trim(),
            timestamp: new Date().toISOString(),
          }));
        } catch (err) {
          // Client disconnected or error sending
          console.error('[LOG STREAM] Error sending log line:', err.message);
        }
      }
    });
  });
  
  // Handle stderr
  tailProcess.stderr.on('data', (data) => {
    console.error('[LOG STREAM] stderr:', data.toString());
    try {
      ws.send(JSON.stringify({
        type: 'error',
        message: data.toString(),
      }));
    } catch (err) {
      // Client disconnected
    }
  });
  
  // Handle process exit
  tailProcess.on('exit', (code, signal) => {
    console.log(`[LOG STREAM] Tail process exited: code=${code}, signal=${signal}`);
    activeTailProcesses.delete(tailProcess);
    try {
      ws.send(JSON.stringify({
        type: 'close',
        message: 'Log stream ended',
      }));
    } catch (err) {
      // Client already disconnected
    }
    ws.close();
  });
  
  // Handle WebSocket close
  ws.on('close', () => {
    console.log('[LOG STREAM] Client disconnected, killing tail process');
    if (tailProcess && !tailProcess.killed) {
      tailProcess.kill('SIGTERM');
    }
    activeTailProcesses.delete(tailProcess);
  });
  
  // Send initial connection message
  ws.send(JSON.stringify({
    type: 'connected',
    message: 'Connected to fail2ban log stream',
    logPath,
  }));
}

/**
 * Get all active tail processes (for graceful shutdown)
 * @returns {Set} Set of active tail processes
 */
function getActiveTailProcesses() {
  return activeTailProcesses;
}

/**
 * Kill all active tail processes
 */
function killAllTailProcesses() {
  const processesToKill = Array.from(activeTailProcesses);
  activeTailProcesses.clear();
  
  processesToKill.forEach((proc) => {
    try {
      if (proc && proc.pid && !proc.killed) {
        // Try SIGTERM first
        proc.kill('SIGTERM');
        
        // Force kill after 500ms if still alive
        setTimeout(() => {
          try {
            if (proc && proc.pid && !proc.killed) {
              process.kill(proc.pid, 'SIGKILL');
            }
          } catch (err) {
            // Process already dead or can't kill
          }
        }, 500);
      }
    } catch (err) {
      // Ignore errors
    }
  });
}

module.exports = {
  streamFail2banLog,
  getActiveTailProcesses,
  killAllTailProcesses,
};

