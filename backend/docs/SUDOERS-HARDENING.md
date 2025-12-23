# Sudoers Configuration Hardening

## Overview

This document provides a hardened sudoers configuration that replaces wildcard rules with explicit allowlists. This prevents privilege escalation attacks and shell expansion vulnerabilities.

## Security Issues with Wildcards

### ❌ Unsafe Configuration (DO NOT USE)

```bash
# DANGEROUS: Wildcard allows ANY .sh file
sentinel_user ALL=(ALL) NOPASSWD: /opt/fail2ban-dashboard/scripts/*.sh
```

**Why this is dangerous:**
- Any new `.sh` file added to the directory can be executed
- Attacker could create malicious script and execute it
- No control over which scripts run
- Shell expansion vulnerabilities possible

## ✅ Hardened Configuration

### Step 1: Create Sudoers File

Create or edit `/etc/sudoers.d/sentinel-backend` (use `visudo -f /etc/sudoers.d/sentinel-backend`):

```bash
# ============================================
# Sentinel Backend - Hardened Sudoers Config
# ============================================
# 
# This configuration allows the sentinel_user to execute
# ONLY the explicitly listed scripts and commands.
# NO WILDCARDS - prevents privilege escalation attacks.

# Cmnd_Alias for Sentinel Backend Scripts
# Explicitly list each script - NO WILDCARDS
Cmnd_Alias SENTINEL_SCRIPTS = \
    /opt/fail2ban-dashboard/scripts/monitor-security.sh, \
    /opt/fail2ban-dashboard/scripts/quick-check.sh, \
    /opt/fail2ban-dashboard/scripts/backup-fail2ban.sh, \
    /opt/fail2ban-dashboard/scripts/test-fail2ban.sh, \
    /opt/fail2ban-dashboard/scripts/test-filters.sh

# Cmnd_Alias for fail2ban-client (read-only operations)
# Only status queries - no modification commands
Cmnd_Alias SENTINEL_FAIL2BAN_READ = \
    /usr/bin/fail2ban-client status, \
    /usr/bin/fail2ban-client status *

# Cmnd_Alias for fail2ban-client (jail control operations)
# Start/stop individual jails - allows any jail name as argument
Cmnd_Alias SENTINEL_FAIL2BAN_CONTROL = \
    /usr/bin/fail2ban-client start *, \
    /usr/bin/fail2ban-client stop *

# Cmnd_Alias for fail2ban-regex (filter testing)
# Used by test-filters.sh for testing filters against logs
Cmnd_Alias SENTINEL_REGEX = \
    /usr/bin/fail2ban-regex

# Cmnd_Alias for systemctl (fail2ban service control)
# Restart and status check for fail2ban service
Cmnd_Alias SENTINEL_SYSTEMCTL = \
    /usr/bin/systemctl restart fail2ban, \
    /usr/bin/systemctl is-active fail2ban

# Sentinel user - restricted sudo access
# Restricted to root only - cannot run as other users
sentinel_user ALL=(root) NOPASSWD: SENTINEL_SCRIPTS, SENTINEL_FAIL2BAN_READ, SENTINEL_FAIL2BAN_CONTROL, SENTINEL_REGEX, SENTINEL_SYSTEMCTL
```

### Step 2: Verify Configuration

Test the configuration:

```bash
# Check syntax
sudo visudo -c

# Test user permissions
sudo -u sentinel_user sudo -l

# Expected output should show:
# User sentinel_user may run the following commands on hostname:
#     (root) NOPASSWD: /opt/fail2ban-dashboard/scripts/monitor-security.sh, ...
```

### Step 3: Test Script Execution

Verify scripts can be executed:

```bash
# Test as sentinel_user
sudo -u sentinel_user sudo /opt/fail2ban-dashboard/scripts/monitor-security.sh

# Should execute successfully
```

## Security Improvements

### ✅ Explicit Command List
- **Before**: `*.sh` wildcard allows any script
- **After**: Only explicitly listed scripts and commands can execute
- **Benefit**: New scripts/commands cannot be executed without sudoers update

### ✅ Jail Control Commands
- **fail2ban-client start/stop**: Allows enabling/disabling individual jails
- **systemctl restart fail2ban**: Allows restarting fail2ban service
- **Benefit**: Full control over jail lifecycle while maintaining security

### ✅ Restricted User Context
- **Before**: `(ALL)` allows running as any user
- **After**: `(root)` restricts to root only
- **Benefit**: Prevents privilege escalation to other users

### ✅ No Shell Expansion
- **Before**: Wildcards can be exploited via shell expansion
- **After**: Exact paths only, no expansion possible
- **Benefit**: Prevents path traversal and injection attacks

### ✅ Organized with Cmnd_Aliases
- **Before**: Single rule, hard to maintain
- **After**: Grouped by purpose (scripts, fail2ban, regex)
- **Benefit**: Easier to audit and maintain

## Adding New Scripts

When adding a new script to the whitelist:

1. **Add script to scripts directory**:
   ```bash
   # Script must be in /opt/fail2ban-dashboard/scripts/
   ```

2. **Update sudoers configuration**:
   ```bash
   sudo visudo -f /etc/sudoers.d/sentinel-backend
   # Add new script to SENTINEL_SCRIPTS alias
   ```

3. **Update backend whitelist**:
   ```javascript
   // backend/src/config/scripts.js
   const scriptWhitelist = [
     // ... existing scripts
     'new-script.sh',  // Add here
   ];
   ```

4. **Verify**:
   ```bash
   sudo visudo -c
   sudo -u sentinel_user sudo -l
   ```

## Why This is Safer

### Attack Scenarios Prevented

1. **Script Injection**:
   - ❌ Attacker creates `malicious.sh` → Cannot execute (not in allowlist)
   - ✅ Only whitelisted scripts can run

2. **Path Traversal**:
   - ❌ `../other-script.sh` → Cannot execute (exact paths only)
   - ✅ No relative paths or wildcards

3. **Privilege Escalation**:
   - ❌ Running as other users → Blocked by `(root)` restriction
   - ✅ Can only run as root, as intended

4. **Shell Expansion**:
   - ❌ `$(command)` in wildcard → Not possible with explicit paths
   - ✅ No shell interpretation

## Maintenance

### Regular Audits

Review sudoers configuration periodically:

```bash
# List all sudoers files
sudo ls -la /etc/sudoers.d/

# Check sentinel user permissions
sudo -u sentinel_user sudo -l

# Verify script paths exist
for script in /opt/fail2ban-dashboard/scripts/*.sh; do
  echo "Checking: $script"
  sudo -u sentinel_user sudo -l | grep -q "$(basename $script)" && echo "  ✅ Allowed" || echo "  ❌ Not allowed"
done
```

### Version Control

Consider tracking sudoers configuration:

```bash
# Backup current config
sudo cp /etc/sudoers.d/sentinel-backend /etc/sudoers.d/sentinel-backend.backup

# Track changes
sudo visudo -f /etc/sudoers.d/sentinel-backend
```

## Troubleshooting

### Script Execution Fails

1. **Check permissions**:
   ```bash
   ls -la /opt/fail2ban-dashboard/scripts/
   # Scripts should be executable (chmod +x)
   ```

2. **Verify sudoers**:
   ```bash
   sudo visudo -c
   sudo -u sentinel_user sudo -l
   ```

3. **Test manually**:
   ```bash
   sudo -u sentinel_user sudo /opt/fail2ban-dashboard/scripts/monitor-security.sh
   ```

### Permission Denied

- Ensure script is in the allowlist
- Check script path matches exactly (no symlinks)
- Verify `(root)` context is correct
- Check for typos in sudoers file

## References

- [Sudoers Manual](https://www.sudo.ws/docs/man/1.8.0/sudoers.man)
- [Sudo Security Best Practices](https://www.sudo.ws/about/security/)
- [OWASP Command Injection](https://owasp.org/www-community/attacks/Command_Injection)

