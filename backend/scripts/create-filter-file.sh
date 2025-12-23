#!/bin/bash
# Helper script to create filter files for fail2ban
# Usage: create-filter-file.sh <filter-name> <filter-content-file>

set -e

FILTER_NAME="$1"
FILTER_CONTENT_FILE="$2"
FILTER_PATH="/etc/fail2ban/filter.d/${FILTER_NAME}.conf"

if [ -z "$FILTER_NAME" ] || [ -z "$FILTER_CONTENT_FILE" ]; then
    echo "Usage: $0 <filter-name> <filter-content-file>"
    exit 1
fi

if [ ! -f "$FILTER_CONTENT_FILE" ]; then
    echo "Error: Filter content file not found: $FILTER_CONTENT_FILE"
    exit 1
fi

# Check if filter already exists
if [ -f "$FILTER_PATH" ]; then
    echo "Filter file already exists: $FILTER_PATH"
    exit 0
fi

# Copy filter file
cp "$FILTER_CONTENT_FILE" "$FILTER_PATH"
chmod 0644 "$FILTER_PATH"
chown root:root "$FILTER_PATH"

echo "Filter file created: $FILTER_PATH"

