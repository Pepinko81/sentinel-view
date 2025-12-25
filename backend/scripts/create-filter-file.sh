#!/bin/bash
# Helper script to create fail2ban filter file
# Usage: create-filter-file.sh <filter-name> <temp-file-path>
# Reads filter content from temp file
# Creates /etc/fail2ban/filter.d/<filter-name>.conf with provided content

FILTER_NAME="$1"
TEMP_FILE="$2"
FILTER_DIR="/etc/fail2ban/filter.d"
FILTER_FILE="${FILTER_DIR}/${FILTER_NAME}.conf"

if [ -z "$FILTER_NAME" ]; then
    echo "Error: Filter name is required" >&2
    exit 1
fi

if [ -z "$TEMP_FILE" ] || [ ! -f "$TEMP_FILE" ]; then
    echo "Error: Temp file path is required and must exist: $TEMP_FILE" >&2
    exit 1
fi

# Check if filter file already exists
if [ -f "$FILTER_FILE" ]; then
    echo "Error: Filter file already exists: $FILTER_FILE" >&2
    exit 1
fi

# Copy temp file to final location
cp "$TEMP_FILE" "$FILTER_FILE"

# Set correct permissions (644)
chmod 644 "$FILTER_FILE"

# Set ownership to root:root
chown root:root "$FILTER_FILE"

echo "Filter file created: $FILTER_FILE"
exit 0
