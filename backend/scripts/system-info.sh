#!/bin/bash
# Get system information: hostname, uptime, memory, disk, load
# This script is whitelisted and executed via sudo

# Hostname
echo "hostname:$(hostname)"

# Uptime
if command -v uptime >/dev/null 2>&1; then
    UPTIME=$(uptime -p 2>/dev/null || uptime | awk -F'up ' '{print $2}' | awk -F',' '{print $1}')
    echo "uptime:$UPTIME"
else
    # Fallback: calculate from /proc/uptime
    UPTIME_SEC=$(awk '{print int($1)}' /proc/uptime 2>/dev/null)
    if [ -n "$UPTIME_SEC" ]; then
        DAYS=$((UPTIME_SEC / 86400))
        HOURS=$(((UPTIME_SEC % 86400) / 3600))
        MINUTES=$(((UPTIME_SEC % 3600) / 60))
        echo "uptime:${DAYS} day${DAYS:+s}, ${HOURS}:$(printf "%02d" $MINUTES)"
    fi
fi

# Memory usage
if command -v free >/dev/null 2>&1; then
    MEM_INFO=$(free -h | grep '^Mem:')
    USED=$(echo "$MEM_INFO" | awk '{print $3}')
    TOTAL=$(echo "$MEM_INFO" | awk '{print $2}')
    PERCENT=$(free | grep '^Mem:' | awk '{printf "%.0f", ($3/$2)*100}')
    echo "memory:${USED}/${TOTAL} (${PERCENT}%)"
fi

# Disk usage (root filesystem)
if command -v df >/dev/null 2>&1; then
    DISK_INFO=$(df -h / | tail -1)
    USED=$(echo "$DISK_INFO" | awk '{print $3}')
    TOTAL=$(echo "$DISK_INFO" | awk '{print $2}')
    PERCENT=$(echo "$DISK_INFO" | awk '{print $5}' | sed 's/%//')
    echo "disk:${USED}/${TOTAL} (${PERCENT}%)"
fi

# Load average
if [ -f /proc/loadavg ]; then
    LOAD=$(awk '{print $1", "$2", "$3}' /proc/loadavg)
    echo "load:$LOAD"
elif command -v uptime >/dev/null 2>&1; then
    LOAD=$(uptime | awk -F'load average:' '{print $2}' | sed 's/^ *//')
    echo "load:$LOAD"
fi

