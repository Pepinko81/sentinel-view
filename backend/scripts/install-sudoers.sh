#!/bin/bash
# Script to install sudoers configuration
# This will copy the sudoers file to /etc/sudoers.d/ and validate it

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SUDOERS_SOURCE="$PROJECT_ROOT/sudoers.d/sentinel-backend"
SUDOERS_TARGET="/etc/sudoers.d/sentinel-backend"
BACKUP_FILE="${SUDOERS_TARGET}.backup.$(date +%Y%m%d_%H%M%S)"

echo "=========================================="
echo "Installing sudoers configuration"
echo "=========================================="
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo "❌ Error: This script must be run as root"
    echo "   Please run: sudo $0"
    exit 1
fi

# Check if source file exists
if [ ! -f "$SUDOERS_SOURCE" ]; then
    echo "❌ Error: Source file not found: $SUDOERS_SOURCE"
    exit 1
fi

# Backup existing file if it exists
if [ -f "$SUDOERS_TARGET" ]; then
    echo "📦 Backing up existing sudoers file..."
    cp "$SUDOERS_TARGET" "$BACKUP_FILE"
    echo "   Backup saved to: $BACKUP_FILE"
else
    echo "📝 Creating new sudoers file..."
fi

# Copy file
echo "📋 Copying sudoers file..."
cp "$SUDOERS_SOURCE" "$SUDOERS_TARGET"
chmod 0440 "$SUDOERS_TARGET"
chown root:root "$SUDOERS_TARGET"

# Validate syntax
echo "✅ Validating sudoers syntax..."
if visudo -c -f "$SUDOERS_TARGET"; then
    echo "   ✅ Syntax is valid!"
else
    echo "   ❌ Syntax validation failed!"
    echo "   Restoring backup..."
    if [ -f "$BACKUP_FILE" ]; then
        cp "$BACKUP_FILE" "$SUDOERS_TARGET"
    else
        rm -f "$SUDOERS_TARGET"
    fi
    exit 1
fi

echo ""
echo "=========================================="
echo "✅ Sudoers configuration installed successfully!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Verify permissions (replace 'pepinko' with your user if different):"
echo "   sudo -u pepinko sudo -l"
echo ""
echo "2. Test fail2ban commands:"
echo "   sudo -u pepinko sudo /usr/bin/fail2ban-client status"
echo "   sudo -u pepinko sudo /usr/bin/fail2ban-client start <jail-name>"
echo "   sudo -u pepinko sudo /usr/bin/systemctl restart fail2ban"
echo ""
echo "3. If you need to change the user, edit the file:"
echo "   sudo visudo -f $SUDOERS_TARGET"
echo "   (Replace 'pepinko' with your actual backend user)"
echo ""
echo "Backup location: $BACKUP_FILE"
echo "=========================================="

