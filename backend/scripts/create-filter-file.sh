#!/bin/bash
# Helper script to create filter files for fail2ban
# Usage: create-filter-file.sh <filter-name> <filter-content-file>

set -e

FILTER_NAME="$1"
FILTER_CONTENT_FILE="$2"
FILTER_PATH="/etc/fail2ban/filter.d/${FILTER_NAME}.conf"

if [ -z "$FILTER_NAME" ] || [ -z "$FILTER_CONTENT_FILE" ]; then
    echo "Error: Missing arguments. Usage: $0 <filter-name> <filter-content-file>" >&2
    exit 1
fi

if [ ! -f "$FILTER_CONTENT_FILE" ]; then
    echo "Error: Filter content file not found: $FILTER_CONTENT_FILE" >&2
    exit 1
fi

# Check if filter already exists
if [ -f "$FILTER_PATH" ]; then
    echo "Filter file already exists: $FILTER_PATH"
    exit 0
fi

# Copy filter file
if ! cp "$FILTER_CONTENT_FILE" "$FILTER_PATH"; then
    echo "Error: Failed to copy filter file to $FILTER_PATH" >&2
    exit 1
fi

# Set permissions
if ! chmod 0644 "$FILTER_PATH"; then
    echo "Error: Failed to set permissions on $FILTER_PATH" >&2
    exit 1
fi

# Set ownership
if ! chown root:root "$FILTER_PATH"; then
    echo "Error: Failed to set ownership on $FILTER_PATH" >&2
    exit 1
fi

echo "Filter file created: $FILTER_PATH"
exit 0

