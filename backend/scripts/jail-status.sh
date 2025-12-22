#!/bin/bash
# Get jail details and banned IPs
# Usage: ./jail-status.sh <jail-name>
# This script is whitelisted and executed via sudo

JAIL_NAME="$1"

if [ -z "$JAIL_NAME" ]; then
    echo "Error: Jail name required" >&2
    exit 1
fi

# Validate jail name contains only safe characters
if ! echo "$JAIL_NAME" | grep -qE '^[a-zA-Z0-9._-]+$'; then
    echo "Error: Invalid jail name" >&2
    exit 1
fi

fail2ban-client status "$JAIL_NAME"

