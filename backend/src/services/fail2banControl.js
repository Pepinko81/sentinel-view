const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const { parseJailStatus, parseFail2banStatus } = require('./parsers/fail2banParser');
const { detectFail2banError, validateOutput } = require('./parsers/parserUtils');
const config = require('../config/config');

const execFileAsync = promisify(execFile);

// Absolute paths (can be overridden via env for portability)
const SUDO_PATH = process.env.SUDO_PATH || '/usr/bin/sudo';
const FAIL2BAN_CLIENT_PATH = process.env.FAIL2BAN_CLIENT_PATH || '/usr/bin/fail2ban-client';

// Allowed actions to prevent arbitrary command execution
const ALLOWED_ACTIONS = new Set(['start', 'stop', 'status']);

// Audit log file (append-only, human-readable)
const AUDIT_LOG_PATH = path.join(__dirname, '../logs/jail-actions.log');

function appendAuditLog(entry) {
  try {
    const dir = path.dirname(AUDIT_LOG_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const line = JSON.stringify({
      timestamp: new Date().toISOString(),
      ...entry,
    }) + '\n';
    fs.appendFileSync(AUDIT_LOG_PATH, line, { encoding: 'utf8' });
  } catch (err) {
    // Audit logging failures must never crash the API
    console.error('Failed to write jail audit log:', err.message);
  }
}

/**
 * Get global fail2ban status (no jail specified).
 * Uses: sudo /usr/bin/fail2ban-client status
 *
 * @returns {Promise<{ status: string, jails: string[] }>}
 */
async function getGlobalFail2banStatus() {
  // Basic safety: only run in environments where fail2ban is expected
  if (!config.fail2banAvailable && config.nodeEnv === 'production') {
    throw new Error('Fail2ban is marked as unavailable in production. Global status blocked.');
  }

  const args = [FAIL2BAN_CLIENT_PATH, 'status'];
  const command = SUDO_PATH;

  appendAuditLog({
    jail: null,
    action: 'status_global',
    step: 'before_exec',
    command,
    args,
    result: 'pending',
  });

  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      timeout: config.scriptTimeout || 30000,
      maxBuffer: 5 * 1024 * 1024,
      encoding: 'utf8',
    });

    appendAuditLog({
      jail: null,
      action: 'status_global',
      step: 'after_exec',
      command,
      args,
      result: 'success',
      stdout: stdout.trim(),
      stderr: stderr.trim(),
    });

    const errorCheck = detectFail2banError(stdout || '', stderr || '');
    if (errorCheck.isError) {
      const err = new Error(errorCheck.message || 'fail2ban error');
      err.errorType = errorCheck.errorType;
      throw err;
    }

    const parsed = parseFail2banStatus(stdout);
    return {
      status: parsed.status || 'unknown',
      jails: parsed.jails || [],
    };
  } catch (err) {
    appendAuditLog({
      jail: null,
      action: 'status_global',
      step: 'after_exec',
      command,
      args,
      result: 'error',
      error: err.message,
    });
    throw err;
  }
}

/**
 * Execute a fail2ban-client action safely.
 *
 * @param {'start'|'stop'|'status'} action
 * @param {string} jailName
 * @param {boolean} ignoreNOK - If true, NOK responses are not treated as errors (for idempotent operations)
 * @returns {Promise<{ stdout: string, stderr: string, nok: boolean }>}
 */
async function runFail2banAction(action, jailName, ignoreNOK = false) {
  if (!ALLOWED_ACTIONS.has(action)) {
    throw new Error(`Invalid fail2ban action: ${action}`);
  }

  if (!jailName || typeof jailName !== 'string') {
    throw new Error('Invalid jail name');
  }

  // Basic safety: only run in environments where fail2ban is expected
  if (!config.fail2banAvailable && config.nodeEnv === 'production') {
    throw new Error('Fail2ban is marked as unavailable in production. Action blocked.');
  }

  const args = [FAIL2BAN_CLIENT_PATH, action, jailName];
  const command = SUDO_PATH;

  appendAuditLog({
    jail: jailName,
    action,
    step: 'before_exec',
    command,
    args,
    result: 'pending',
  });

  try {
    // Use shorter timeout for start/stop actions (10 seconds)
    // Longer timeout for status (30 seconds)
    const actionTimeout = (action === 'start' || action === 'stop') ? 10000 : (config.scriptTimeout || 30000);
    
    const { stdout, stderr } = await execFileAsync(command, args, {
      timeout: actionTimeout,
      maxBuffer: 5 * 1024 * 1024,
      encoding: 'utf8',
    });

    const errorCheck = detectFail2banError(stdout || '', stderr || '');
    const isNOK = errorCheck.isError && (
      (errorCheck.message || '').toLowerCase().includes('nok') ||
      (stdout || '').toLowerCase().includes('error   nok') ||
      (stdout || '').toLowerCase().includes('error nok')
    );

    // If ignoreNOK is true and this is a NOK response, don't treat it as error
    if (isNOK && ignoreNOK) {
      appendAuditLog({
        jail: jailName,
        action,
        step: 'after_exec',
        command,
        args,
        result: 'nok_ignored',
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      });
      return { stdout, stderr, nok: true };
    }

    if (errorCheck.isError && !isNOK) {
      // Real error, not just NOK
      const err = new Error(errorCheck.message || 'fail2ban error');
      err.errorType = errorCheck.errorType;
      appendAuditLog({
        jail: jailName,
        action,
        step: 'after_exec',
        command,
        args,
        result: 'error',
        error: err.message,
      });
      throw err;
    }

    appendAuditLog({
      jail: jailName,
      action,
      step: 'after_exec',
      command,
      args,
      result: 'success',
      stdout: stdout.trim(),
      stderr: stderr.trim(),
    });

    return { stdout, stderr, nok: false };
  } catch (err) {
    // Check if process was killed (timeout or signal)
    const wasKilled = err.killed === true || err.signal !== null;
    
    // Check error message/stderr for fail2ban service errors
    const errorOutput = (err.stderr || err.message || '').toString();
    const errorCheck = detectFail2banError('', errorOutput);
    
    // If it's a service-down error, throw a clear error
    if (errorCheck.isError && errorCheck.errorType === 'service_down') {
      const serviceError = new Error('fail2ban service is not running. Please start the service first using: sudo systemctl start fail2ban');
      serviceError.errorType = 'service_down';
      serviceError.code = err.code;
      
      appendAuditLog({
        jail: jailName,
        action,
        step: 'after_exec',
        command,
        args,
        result: 'error',
        error: serviceError.message,
        errorType: 'service_down',
      });
      throw serviceError;
    }
    
    // Check if it's a NOK in the error message
    const isNOK = (err.message || '').toLowerCase().includes('nok');
    
    // If process was killed and ignoreNOK is true, check if it might be OK
    // (e.g., jail already in desired state)
    if ((wasKilled || isNOK) && ignoreNOK) {
      console.warn(`[FAIL2BAN CONTROL] Process ${wasKilled ? 'killed' : 'NOK'} for ${action} ${jailName}, but ignoreNOK=true`);
      appendAuditLog({
        jail: jailName,
        action,
        step: 'after_exec',
        command,
        args,
        result: wasKilled ? 'killed_ignored' : 'nok_ignored',
        error: err.message,
        killed: wasKilled,
      });
      return { stdout: '', stderr: err.message, nok: true, killed: wasKilled };
    }

    // If process was killed, provide more helpful error message
    if (wasKilled) {
      const timeoutMsg = err.code === 'ETIMEDOUT' || err.killed === true
        ? 'Command timed out'
        : `Process was killed (signal: ${err.signal || 'unknown'})`;
      
      const enhancedError = new Error(`${timeoutMsg}: ${action} ${jailName}. This may indicate the jail is already in the desired state or fail2ban is unresponsive.`);
      enhancedError.killed = true;
      enhancedError.code = err.code;
      enhancedError.signal = err.signal;
      
      appendAuditLog({
        jail: jailName,
        action,
        step: 'after_exec',
        command,
        args,
        result: 'error',
        error: enhancedError.message,
        killed: true,
      });
      throw enhancedError;
    }

    appendAuditLog({
      jail: jailName,
      action,
      step: 'after_exec',
      command,
      args,
      result: 'error',
      error: err.message,
    });
    throw err;
  }
}

/**
 * Verify jail state after an action by running `status <jail>` and parsing it.
 *
 * @param {string} jailName
 * @returns {Promise<{ enabled: boolean, bannedCount: number }>}
 */
async function verifyJailState(jailName) {
  try {
    const { stdout, stderr } = await runFail2banAction('status', jailName);

    const validation = validateOutput(stdout);
    if (!validation.valid) {
      throw new Error(validation.error || 'Invalid status output');
    }

    const parsed = parseJailStatus(stdout, jailName);
    return {
      enabled: Boolean(parsed.enabled),
      bannedCount: typeof parsed.bannedCount === 'number' ? parsed.bannedCount : 0,
    };
  } catch (err) {
    // If status fails because jail no longer exists, treat as disabled
    const message = (err && err.message) || '';
    if (
      message.toLowerCase().includes('does not exist') ||
      message.toLowerCase().includes('no such jail') ||
      message.toLowerCase().includes('jail not found') ||
      // fail2ban error format when jail is unknown: "ERROR   NOK: ('nginx-robots-scan',)"
      message.toLowerCase().includes('error   nok') ||
      message.toLowerCase().includes('error nok')
    ) {
      return { enabled: false, bannedCount: 0 };
    }

    // Propagate other errors for the caller to decide
    throw err;
  }
}

/**
 * Restart fail2ban service
 * Executes: sudo /usr/bin/systemctl restart fail2ban
 * Waits for service to come back and verifies status
 * 
 * @returns {Promise<{ success: boolean, message: string }>}
 */
async function restartFail2ban() {
  const SYSTEMCTL_PATH = process.env.SYSTEMCTL_PATH || '/usr/bin/systemctl';
  const FAIL2BAN_SERVICE = 'fail2ban';
  
  // Basic safety: only run in environments where fail2ban is expected
  if (!config.fail2banAvailable && config.nodeEnv === 'production') {
    throw new Error('Fail2ban is marked as unavailable in production. Restart blocked.');
  }

  const args = [SYSTEMCTL_PATH, 'restart', FAIL2BAN_SERVICE];
  const command = SUDO_PATH;

  appendAuditLog({
    jail: null,
    action: 'restart_service',
    step: 'before_exec',
    command,
    args,
    result: 'pending',
  });

  try {
    // Execute restart command
    const { stdout, stderr } = await execFileAsync(command, args, {
      timeout: config.scriptTimeout || 30000,
      maxBuffer: 1024 * 1024,
      encoding: 'utf8',
    });

    appendAuditLog({
      jail: null,
      action: 'restart_service',
      step: 'after_exec',
      command,
      args,
      result: 'success',
      stdout: stdout.trim(),
      stderr: stderr.trim(),
    });

    // Wait a moment for service to stabilize
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Verify service is running
    try {
      const statusArgs = [SYSTEMCTL_PATH, 'is-active', FAIL2BAN_SERVICE];
      const { stdout: statusStdout } = await execFileAsync(SUDO_PATH, statusArgs, {
        timeout: 10000,
        maxBuffer: 1024,
        encoding: 'utf8',
      });

      const isActive = statusStdout.trim() === 'active';
      
      if (!isActive) {
        throw new Error(`Service restart completed but status is not 'active': ${statusStdout.trim()}`);
      }

      // Additional verification: check fail2ban-client status
      try {
        await getGlobalFail2banStatus();
      } catch (err) {
        // If fail2ban-client status fails, service might still be starting
        // Wait a bit more and try once more
        await new Promise(resolve => setTimeout(resolve, 3000));
        await getGlobalFail2banStatus();
      }

      return {
        success: true,
        message: 'Fail2ban service restarted successfully',
      };
    } catch (verifyErr) {
      appendAuditLog({
        jail: null,
        action: 'restart_service',
        step: 'verification_failed',
        command,
        args,
        result: 'error',
        error: verifyErr.message,
      });
      throw new Error(`Restart completed but verification failed: ${verifyErr.message}`);
    }
  } catch (err) {
    appendAuditLog({
      jail: null,
      action: 'restart_service',
      step: 'after_exec',
      command,
      args,
      result: 'error',
      error: err.message,
    });
    throw err;
  }
}

module.exports = {
  runFail2banAction,
  verifyJailState,
  getGlobalFail2banStatus,
  restartFail2ban,
  appendAuditLog,
};


