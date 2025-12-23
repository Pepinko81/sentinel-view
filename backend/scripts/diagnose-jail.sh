#!/bin/bash
# Script to diagnose why a jail cannot be started
# Usage: ./diagnose-jail.sh <jail-name>

set -e

JAIL_NAME="${1:-nginx-webdav-attacks}"

echo "=========================================="
echo "Diagnosing jail: $JAIL_NAME"
echo "=========================================="
echo ""

# Check if jail is configured
echo "1. Checking if jail is configured..."
if grep -r "\[$JAIL_NAME\]" /etc/fail2ban/jail.d/ /etc/fail2ban/jail.local 2>/dev/null; then
    echo "   ✅ Jail found in configuration files"
else
    echo "   ❌ Jail NOT found in configuration files"
    echo "   Checking jail.d directory:"
    ls -la /etc/fail2ban/jail.d/ 2>/dev/null || echo "   Directory does not exist"
    echo "   Checking jail.local:"
    ls -la /etc/fail2ban/jail.local 2>/dev/null || echo "   File does not exist"
fi
echo ""

# Check jail configuration details
echo "2. Checking jail configuration details..."
CONFIG_FILE=$(grep -l "\[$JAIL_NAME\]" /etc/fail2ban/jail.d/*.conf /etc/fail2ban/jail.local 2>/dev/null | head -1)
if [ -n "$CONFIG_FILE" ]; then
    echo "   Configuration file: $CONFIG_FILE"
    echo "   Configuration content:"
    sed -n "/\[$JAIL_NAME\]/,/^\[/p" "$CONFIG_FILE" | head -20
else
    echo "   ❌ Configuration file not found"
fi
echo ""

# Check if filter exists
echo "3. Checking filter configuration..."
FILTER_NAME=$(grep -A 20 "\[$JAIL_NAME\]" "$CONFIG_FILE" 2>/dev/null | grep "^filter\s*=" | head -1 | awk -F'=' '{print $2}' | tr -d ' ' || echo "")
if [ -n "$FILTER_NAME" ]; then
    echo "   Filter name: $FILTER_NAME"
    FILTER_FILE="/etc/fail2ban/filter.d/${FILTER_NAME}.conf"
    if [ -f "$FILTER_FILE" ]; then
        echo "   ✅ Filter file exists: $FILTER_FILE"
    else
        echo "   ❌ Filter file NOT found: $FILTER_FILE"
    fi
else
    echo "   ⚠️  Filter name not found in configuration"
fi
echo ""

# Check if action exists
echo "4. Checking action configuration..."
ACTION_NAME=$(grep -A 20 "\[$JAIL_NAME\]" "$CONFIG_FILE" 2>/dev/null | grep "^action\s*=" | head -1 | awk -F'=' '{print $2}' | tr -d ' ' || echo "")
if [ -n "$ACTION_NAME" ]; then
    echo "   Action name: $ACTION_NAME"
    ACTION_FILE="/etc/fail2ban/action.d/${ACTION_NAME}.conf"
    if [ -f "$ACTION_FILE" ]; then
        echo "   ✅ Action file exists: $ACTION_FILE"
    else
        echo "   ⚠️  Action file not found (may use default): $ACTION_FILE"
    fi
else
    echo "   ⚠️  Action not specified (will use default)"
fi
echo ""

# Check fail2ban service status
echo "5. Checking fail2ban service status..."
systemctl is-active fail2ban >/dev/null 2>&1 && echo "   ✅ fail2ban service is active" || echo "   ❌ fail2ban service is NOT active"
systemctl is-enabled fail2ban >/dev/null 2>&1 && echo "   ✅ fail2ban service is enabled" || echo "   ⚠️  fail2ban service is NOT enabled"
echo ""

# Check fail2ban logs for errors
echo "6. Checking recent fail2ban logs for errors..."
if [ -f /var/log/fail2ban.log ]; then
    echo "   Recent errors related to $JAIL_NAME:"
    grep -i "$JAIL_NAME" /var/log/fail2ban.log | tail -10 || echo "   No recent errors found"
else
    echo "   ⚠️  Log file not found: /var/log/fail2ban.log"
fi
echo ""

# Try to start jail manually and capture output
echo "7. Attempting to start jail (this will show the actual error)..."
sudo /usr/bin/fail2ban-client start "$JAIL_NAME" 2>&1 || true
echo ""

# Check jail status after attempt
echo "8. Checking jail status after start attempt..."
sudo /usr/bin/fail2ban-client status "$JAIL_NAME" 2>&1 || echo "   Jail is not running"
echo ""

echo "=========================================="
echo "Diagnosis complete"
echo "=========================================="

