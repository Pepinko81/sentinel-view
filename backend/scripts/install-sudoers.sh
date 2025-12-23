#!/bin/bash
# Script to install/update sudoers configuration for sentinel-backend
# Usage: sudo ./install-sudoers.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SUDOERS_SOURCE="$PROJECT_ROOT/sudoers.d/sentinel-backend"
SUDOERS_TARGET="/etc/sudoers.d/sentinel-backend"

echo "=========================================="
echo "Installing Sentinel Backend Sudoers Config"
echo "=========================================="
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo "❌ Error: This script must be run as root (use sudo)"
    exit 1
fi

# Check if source file exists
if [ ! -f "$SUDOERS_SOURCE" ]; then
    echo "❌ Error: Source file not found: $SUDOERS_SOURCE"
    exit 1
fi

# Backup existing sudoers file if it exists
if [ -f "$SUDOERS_TARGET" ]; then
    BACKUP_FILE="${SUDOERS_TARGET}.backup.$(date +%Y%m%d_%H%M%S)"
    echo "📦 Backing up existing sudoers file to: $BACKUP_FILE"
    cp "$SUDOERS_TARGET" "$BACKUP_FILE"
fi

# Copy sudoers file
echo "📋 Copying sudoers configuration..."
cp "$SUDOERS_SOURCE" "$SUDOERS_TARGET"
chmod 0440 "$SUDOERS_TARGET"
chown root:root "$SUDOERS_TARGET"

# Validate sudoers syntax
echo "✅ Validating sudoers syntax..."
if visudo -c -f "$SUDOERS_TARGET" 2>/dev/null; then
    echo "   ✅ Sudoers syntax is valid!"
else
    echo "   ❌ Sudoers syntax error!"
    if [ -f "$BACKUP_FILE" ]; then
        echo "   🔄 Restoring backup..."
        cp "$BACKUP_FILE" "$SUDOERS_TARGET"
    fi
    exit 1
fi

echo ""
echo "=========================================="
echo "✅ Sudoers configuration installed successfully!"
echo "=========================================="
echo ""
echo "To verify permissions, run:"
echo "  sudo -u pepinko sudo -l"
echo ""
echo "Expected output should include:"
echo "  SENTINEL_FAIL2BAN_CONTROL"
echo "  /usr/bin/fail2ban-client start *"
echo "  /usr/bin/fail2ban-client stop *"
echo ""
