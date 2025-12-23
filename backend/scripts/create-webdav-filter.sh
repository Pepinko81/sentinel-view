#!/bin/bash
# Script to create nginx-webdav-attacks filter file
# This filter detects WebDAV exploitation attempts

set -e

FILTER_FILE="/etc/fail2ban/filter.d/nginx-webdav-attacks.conf"
BACKUP_FILE="${FILTER_FILE}.backup.$(date +%Y%m%d_%H%M%S)"

echo "=========================================="
echo "Creating nginx-webdav-attacks filter"
echo "=========================================="
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo "❌ Error: This script must be run as root"
    echo "   Please run: sudo $0"
    exit 1
fi

# Backup existing file if it exists
if [ -f "$FILTER_FILE" ]; then
    echo "📦 Backing up existing filter file..."
    cp "$FILTER_FILE" "$BACKUP_FILE"
    echo "   Backup saved to: $BACKUP_FILE"
fi

# Create filter file
echo "📝 Creating filter file: $FILTER_FILE"
cat > "$FILTER_FILE" << 'EOF'
# fail2ban filter configuration for nginx WebDAV attacks
# Detects WebDAV exploitation attempts (PROPFIND, OPTIONS, MKCOL, PUT, DELETE, etc.)

[Definition]

# Match WebDAV methods that are commonly used in attacks
# PROPFIND - used to enumerate directory structures
# OPTIONS - used to discover server capabilities
# MKCOL - used to create directories
# PUT - used to upload malicious files
# DELETE - used to delete files
# MOVE - used to move/rename files
# COPY - used to copy files
# LOCK/UNLOCK - used for file locking attacks
failregex = ^<HOST> -.*"(PROPFIND|OPTIONS|MKCOL|PUT|DELETE|MOVE|COPY|LOCK|UNLOCK).*HTTP.*
            ^<HOST> -.*"PROPFIND.*HTTP.*
            ^<HOST> -.*"OPTIONS.*HTTP.*
            ^<HOST> -.*"MKCOL.*HTTP.*
            ^<HOST> -.*"PUT.*HTTP.*
            ^<HOST> -.*"DELETE.*HTTP.*
            ^<HOST> -.*"MOVE.*HTTP.*
            ^<HOST> -.*"COPY.*HTTP.*
            ^<HOST> -.*"LOCK.*HTTP.*
            ^<HOST> -.*"UNLOCK.*HTTP.*

ignoreregex = 

# DEV NOTES:
# This filter catches common WebDAV exploitation attempts
# WebDAV methods are legitimate but often abused for reconnaissance and attacks
# Adjust maxretry and bantime in jail configuration based on your needs
EOF

chmod 0644 "$FILTER_FILE"
chown root:root "$FILTER_FILE"

echo "   ✅ Filter file created successfully!"
echo ""

# Validate filter syntax
echo "✅ Validating filter syntax..."
if fail2ban-regex --test-filter "$FILTER_FILE" 2>&1 | grep -q "OK"; then
    echo "   ✅ Filter syntax is valid!"
else
    echo "   ⚠️  Filter validation warning (may still work)"
    fail2ban-regex --test-filter "$FILTER_FILE" 2>&1 | tail -5
fi
echo ""

# Test against log file if it exists
if [ -f "/var/log/nginx/access.log" ]; then
    echo "🧪 Testing filter against access.log..."
    TEST_COUNT=$(tail -1000 /var/log/nginx/access.log | fail2ban-regex - "$FILTER_FILE" 2>&1 | grep -E "Lines:.*matched" | awk '{print $2}' || echo "0")
    echo "   Found $TEST_COUNT matches in last 1000 log lines"
fi
echo ""

echo "=========================================="
echo "✅ Filter file created successfully!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Restart fail2ban to load the new filter:"
echo "   sudo systemctl restart fail2ban"
echo ""
echo "2. Start the jail:"
echo "   sudo fail2ban-client start nginx-webdav-attacks"
echo ""
echo "3. Verify jail is running:"
echo "   sudo fail2ban-client status nginx-webdav-attacks"
echo ""
if [ -f "$BACKUP_FILE" ]; then
    echo "Backup location: $BACKUP_FILE"
fi
echo "=========================================="

