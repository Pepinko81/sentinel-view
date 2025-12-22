#!/bin/bash
# Backup fail2ban configuration
# This script is whitelisted and executed via sudo

BACKUP_DIR="${BACKUP_DIR:-/tmp}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/fail2ban-backup-$TIMESTAMP.tar.gz"

# Create backup of fail2ban configuration
if [ -d /etc/fail2ban ]; then
    tar -czf "$BACKUP_FILE" -C /etc fail2ban 2>/dev/null
    
    if [ $? -eq 0 ] && [ -f "$BACKUP_FILE" ]; then
        echo "Backup created: $BACKUP_FILE"
        echo "Size: $(du -h "$BACKUP_FILE" | cut -f1)"
        exit 0
    else
        echo "Error: Failed to create backup" >&2
        exit 1
    fi
else
    echo "Error: /etc/fail2ban directory not found" >&2
    exit 1
fi

