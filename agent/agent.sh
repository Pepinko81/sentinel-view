#!/bin/bash
#
# Sentinel Agent - Fail2Ban Data Collector
# Collects fail2ban status and pushes to HQ server
#

set -euo pipefail

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="${SCRIPT_DIR}/config.json"

# Check if config exists
if [ ! -f "$CONFIG_FILE" ]; then
  echo "ERROR: config.json not found at $CONFIG_FILE" >&2
  exit 1
fi

# Check if jq is available
if ! command -v jq &> /dev/null; then
  echo "ERROR: jq is required but not found. Install with: apt-get install jq" >&2
  exit 1
fi

# Read config
SERVER_ID=$(jq -r '.serverId' "$CONFIG_FILE" 2>/dev/null || echo "")
if [ $? -ne 0 ] || [ -z "$SERVER_ID" ]; then
  echo "ERROR: Failed to read serverId from config.json" >&2
  echo "Config file: $CONFIG_FILE" >&2
  exit 1
fi

SECRET=$(jq -r '.secret' "$CONFIG_FILE" 2>/dev/null || echo "")
if [ $? -ne 0 ] || [ -z "$SECRET" ]; then
  echo "ERROR: Failed to read secret from config.json" >&2
  exit 1
fi

HQ_URL=$(jq -r '.hqUrl' "$CONFIG_FILE" 2>/dev/null || echo "")
if [ $? -ne 0 ] || [ -z "$HQ_URL" ]; then
  echo "ERROR: Failed to read hqUrl from config.json" >&2
  exit 1
fi

# Validate config
if [ -z "$SERVER_ID" ] || [ "$SERVER_ID" == "null" ]; then
  echo "ERROR: serverId not found in config.json" >&2
  exit 1
fi

if [ -z "$SECRET" ] || [ "$SECRET" == "null" ]; then
  echo "ERROR: secret not found in config.json" >&2
  exit 1
fi

if [ -z "$HQ_URL" ] || [ "$HQ_URL" == "null" ]; then
  echo "ERROR: hqUrl not found in config.json" >&2
  exit 1
fi

# Check if fail2ban-client is available
if ! command -v fail2ban-client &> /dev/null; then
  echo "ERROR: fail2ban-client not found" >&2
  exit 1
fi

# Collect fail2ban status
echo "Collecting fail2ban status..." >&2

# Get global status (fail2ban-client requires root, but service runs as root)
GLOBAL_STATUS=$(fail2ban-client status 2>&1)
F2B_EXIT=$?
if [ $F2B_EXIT -ne 0 ]; then
  echo "ERROR: fail2ban-client failed with exit code $F2B_EXIT" >&2
  echo "Output: $GLOBAL_STATUS" >&2
  exit 1
fi

if [ -z "$GLOBAL_STATUS" ]; then
  echo "WARNING: fail2ban-client returned empty status" >&2
  GLOBAL_STATUS=""
fi

# Extract jail names
JAIL_NAMES=$(echo "$GLOBAL_STATUS" | grep -E "^\s+Jail list:" | sed 's/.*Jail list:\s*//' | tr ',' ' ' | xargs || echo "")

# Initialize arrays
JAILS_JSON="[]"
BANS_JSON="[]"

# If jails exist, collect details
if [ -n "$JAIL_NAMES" ]; then
  JAILS_ARRAY="["
  BANS_ARRAY="["
  FIRST_JAIL=true
  
  for JAIL in $JAIL_NAMES; do
    JAIL=$(echo "$JAIL" | xargs) # trim whitespace
    
    if [ -z "$JAIL" ]; then
      continue
    fi
    
    # Get jail status
    JAIL_STATUS=$(fail2ban-client status "$JAIL" 2>/dev/null || echo "")
    
    # Extract banned IPs
    BANNED_IPS=$(echo "$JAIL_STATUS" | grep -E "^\s+Banned IP list:" | sed 's/.*Banned IP list:\s*//' | tr ',' ' ' | xargs)
    
    # Count banned IPs
    BAN_COUNT=0
    if [ -n "$BANNED_IPS" ] && [ "$BANNED_IPS" != " " ]; then
      BAN_COUNT=$(echo "$BANNED_IPS" | wc -w)
    fi
    
    # Check if jail is enabled
    ENABLED="false"
    if echo "$GLOBAL_STATUS" | grep -q "$JAIL"; then
      ENABLED="true"
    fi
    
    # Add to arrays
    if [ "$FIRST_JAIL" = true ]; then
      FIRST_JAIL=false
    else
      JAILS_ARRAY+=","
      BANS_ARRAY+=","
    fi
    
    JAILS_ARRAY+="{\"name\":\"$JAIL\",\"enabled\":$ENABLED,\"bans\":$BAN_COUNT}"
    
    # Add banned IPs
    if [ -n "$BANNED_IPS" ] && [ "$BANNED_IPS" != " " ]; then
      for IP in $BANNED_IPS; do
        IP=$(echo "$IP" | xargs)
        if [ -n "$IP" ]; then
          if [ "$BANS_ARRAY" != "[" ]; then
            BANS_ARRAY+=","
          fi
          BANS_ARRAY+="{\"jail\":\"$JAIL\",\"ip\":\"$IP\"}"
        fi
      done
    fi
  done
  
  JAILS_ARRAY+="]"
  BANS_ARRAY+="]"
  JAILS_JSON="$JAILS_ARRAY"
  BANS_JSON="$BANS_ARRAY"
fi

# Get last 20 lines of fail2ban log
LOG_LINES="[]"
if [ -f "/var/log/fail2ban.log" ]; then
  LOG_TAIL=$(tail -n 20 /var/log/fail2ban.log 2>/dev/null || echo "")
  if [ -n "$LOG_TAIL" ]; then
    # Convert log lines to JSON array
    LOG_ARRAY="["
    FIRST_LINE=true
    while IFS= read -r LINE; do
      if [ -n "$LINE" ]; then
        if [ "$FIRST_LINE" = true ]; then
          FIRST_LINE=false
        else
          LOG_ARRAY+=","
        fi
        # Escape JSON
        ESCAPED_LINE=$(echo "$LINE" | sed 's/\\/\\\\/g' | sed 's/"/\\"/g')
        LOG_ARRAY+="\"$ESCAPED_LINE\""
      fi
    done <<< "$LOG_TAIL"
    LOG_ARRAY+="]"
    LOG_LINES="$LOG_ARRAY"
  fi
fi

# Get agent server URL (if configured)
AGENT_PORT=$(jq -r '.listenPort // .port // 4040' "$CONFIG_FILE" 2>/dev/null || echo "4040")
REMOTE_URL=""

# Try to get primary IP
PRIMARY_IP=$(ip route get 8.8.8.8 2>/dev/null | awk '{print $7; exit}' || hostname -I 2>/dev/null | awk '{print $1}' || echo "")
if [ -n "$PRIMARY_IP" ] && [ "$PRIMARY_IP" != " " ]; then
  REMOTE_URL="http://${PRIMARY_IP}:${AGENT_PORT}"
fi

# Build payload
PAYLOAD=$(cat <<EOF
{
  "serverId": "$SERVER_ID",
  "timestamp": $(date +%s),
  "jails": $JAILS_JSON,
  "bans": $BANS_JSON,
  "logTail": $LOG_LINES,
  "remoteUrl": "$REMOTE_URL"
}
EOF
)

# Send to HQ
echo "Sending data to HQ: $HQ_URL/api/agent/push" >&2
RESPONSE=$(curl -s -w "\n%{http_code}" \
  -X POST \
  -H "Content-Type: application/json" \
  -H "X-Sentinel-ID: $SERVER_ID" \
  -H "X-Sentinel-Key: $SECRET" \
  -d "$PAYLOAD" \
  "$HQ_URL/api/agent/push" 2>&1)

# Check if curl failed
CURL_EXIT=$?
if [ $CURL_EXIT -ne 0 ]; then
  echo "ERROR: curl failed with exit code $CURL_EXIT" >&2
  echo "Response: $RESPONSE" >&2
  exit 1
fi

# Extract HTTP code (last line)
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
# Extract body (all lines except last)
BODY=$(echo "$RESPONSE" | head -n-1)

# Debug output
echo "DEBUG: HTTP_CODE='$HTTP_CODE'" >&2
echo "DEBUG: BODY length=${#BODY}" >&2

# Validate HTTP_CODE is a number
if ! [[ "$HTTP_CODE" =~ ^[0-9]+$ ]]; then
  echo "ERROR: Invalid HTTP code received: '$HTTP_CODE'" >&2
  echo "Full response: $RESPONSE" >&2
  exit 1
fi

# Check response
if [ "$HTTP_CODE" -eq 200 ] || [ "$HTTP_CODE" -eq 201 ]; then
  echo "Successfully pushed data to HQ (HTTP $HTTP_CODE)" >&2
  exit 0
else
  echo "ERROR: Failed to push data to HQ (HTTP $HTTP_CODE)" >&2
  echo "Response: $BODY" >&2
  exit 1
fi

