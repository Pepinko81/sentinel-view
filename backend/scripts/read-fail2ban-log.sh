#!/bin/bash
# Helper script to read fail2ban log file
# Usage: read-fail2ban-log.sh [lines]
# Reads last N lines from /var/log/fail2ban.log (default: 100)

LINES=${1:-100}
LOG_FILE="/var/log/fail2ban.log"

if [ ! -f "$LOG_FILE" ]; then
    echo "Error: Log file not found: $LOG_FILE" >&2
    exit 1
fi

tail -n "$LINES" "$LOG_FILE"

