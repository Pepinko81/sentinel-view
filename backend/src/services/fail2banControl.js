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
 * @returns {Promise<{ stdout: string, stderr: string }>}
 */
async function runFail2banAction(action, jailName) {
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
    const { stdout, stderr } = await execFileAsync(command, args, {
      timeout: config.scriptTimeout || 30000,
      maxBuffer: 5 * 1024 * 1024,
      encoding: 'utf8',
    });

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

    const errorCheck = detectFail2banError(stdout || '', stderr || '');
    if (errorCheck.isError) {
      const err = new Error(errorCheck.message || 'fail2ban error');
      err.errorType = errorCheck.errorType;
      throw err;
    }

    return { stdout, stderr };
  } catch (err) {
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

module.exports = {
  runFail2banAction,
  verifyJailState,
  getGlobalFail2banStatus,
  appendAuditLog,
};


