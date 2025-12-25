#!/bin/bash
# Helper script to write fail2ban jail configuration file
# Usage: write-jail-config.sh <target-file> <temp-file-path>
# Reads config content from temp file
# Writes to target file (jail.local or jail.d/*.conf) with proper permissions

TARGET_FILE="$1"
TEMP_FILE="$2"

if [ -z "$TARGET_FILE" ]; then
    echo "Error: Target file path is required" >&2
    exit 1
fi

if [ -z "$TEMP_FILE" ] || [ ! -f "$TEMP_FILE" ]; then
    echo "Error: Temp file path is required and must exist: $TEMP_FILE" >&2
    exit 1
fi

# Ensure target directory exists
TARGET_DIR=$(dirname "$TARGET_FILE")
if [ ! -d "$TARGET_DIR" ]; then
    mkdir -p "$TARGET_DIR"
fi

# Copy temp file to target location
cp "$TEMP_FILE" "$TARGET_FILE"

# Set correct permissions (644)
chmod 644 "$TARGET_FILE"

# Set ownership to root:root
chown root:root "$TARGET_FILE"

echo "Jail config file written: $TARGET_FILE"
exit 0

