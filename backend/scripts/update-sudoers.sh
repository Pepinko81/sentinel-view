#!/bin/bash
# Script to update sudoers configuration for fail2ban control commands
# This adds permissions for start/stop jails and restart fail2ban service

set -e

SUDOERS_FILE="/etc/sudoers.d/sentinel-backend"
BACKUP_FILE="${SUDOERS_FILE}.backup.$(date +%Y%m%d_%H%M%S)"

echo "=========================================="
echo "Updating sudoers configuration for fail2ban control"
echo "=========================================="

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo "Error: This script must be run as root"
    exit 1
fi

# Backup existing sudoers file
if [ -f "$SUDOERS_FILE" ]; then
    echo "Backing up existing sudoers file to: $BACKUP_FILE"
    cp "$SUDOERS_FILE" "$BACKUP_FILE"
else
    echo "Creating new sudoers file: $SUDOERS_FILE"
fi

# Create temporary file with updated configuration
TEMP_FILE=$(mktemp)
cat > "$TEMP_FILE" << 'EOF'
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

# Cmnd_Alias for filter file management
# Allows creating filter files automatically when enabling jails
Cmnd_Alias SENTINEL_FILTER_MGMT = \
    /home/pepinko/sentinel-view/backend/scripts/create-filter-file.sh

# Sentinel user - restricted sudo access
# Restricted to root only - cannot run as other users
pepinko ALL=(root) NOPASSWD: SENTINEL_SCRIPTS, SENTINEL_FAIL2BAN_READ, SENTINEL_FAIL2BAN_CONTROL, SENTINEL_REGEX, SENTINEL_SYSTEMCTL, SENTINEL_FILTER_MGMT
EOF

# Validate syntax
echo "Validating sudoers syntax..."
visudo -c -f "$TEMP_FILE"

if [ $? -eq 0 ]; then
    echo "Syntax is valid. Installing updated configuration..."
    cp "$TEMP_FILE" "$SUDOERS_FILE"
    chmod 0440 "$SUDOERS_FILE"
    echo "✅ Sudoers configuration updated successfully!"
    echo ""
    echo "Backup saved to: $BACKUP_FILE"
    echo ""
    echo "To verify, run:"
    echo "  sudo -u sentinel_user sudo -l"
else
    echo "❌ Syntax validation failed! Configuration not updated."
    echo "Please check the configuration manually."
    rm "$TEMP_FILE"
    exit 1
fi

rm "$TEMP_FILE"

echo ""
echo "=========================================="
echo "Next steps:"
echo "1. Verify permissions: sudo -u sentinel_user sudo -l"
echo "2. Test jail start: sudo -u sentinel_user sudo /usr/bin/fail2ban-client start <jail-name>"
echo "3. Test restart: sudo -u sentinel_user sudo /usr/bin/systemctl restart fail2ban"
echo "=========================================="

