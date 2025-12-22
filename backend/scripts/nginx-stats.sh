#!/bin/bash
# Parse nginx access logs for security events
# Counts 404s, admin scans, webdav attacks, hidden file attempts
# This script is whitelisted and executed via sudo

NGINX_LOG="${NGINX_ACCESS_LOG:-/var/log/nginx/access.log}"

if [ ! -f "$NGINX_LOG" ]; then
    echo "404_count:0" >&2
    echo "admin_scans:0" >&2
    echo "webdav_attacks:0" >&2
    echo "hidden_files_attempts:0" >&2
    exit 0
fi

# Count 404 errors (last 24 hours)
FOUR_OH_FOUR=$(grep -c " 404 " "$NGINX_LOG" 2>/dev/null || echo "0")

# Count admin panel scans (last 24 hours)
ADMIN_SCANS=$(grep -iE "(/admin|/wp-admin|/administrator|/phpmyadmin|/cpanel)" "$NGINX_LOG" 2>/dev/null | wc -l)

# Count WebDAV attacks
WEBDAV=$(grep -iE "(PROPFIND|PROPPATCH|MKCOL|COPY|MOVE|LOCK|UNLOCK)" "$NGINX_LOG" 2>/dev/null | wc -l)

# Count hidden file attempts (.env, .git, etc.)
HIDDEN_FILES=$(grep -iE "(\.env|\.git|\.svn|\.htaccess|\.htpasswd|\.DS_Store)" "$NGINX_LOG" 2>/dev/null | wc -l)

echo "404_count:$FOUR_OH_FOUR"
echo "admin_scans:$ADMIN_SCANS"
echo "webdav_attacks:$WEBDAV"
echo "hidden_files_attempts:$HIDDEN_FILES"

