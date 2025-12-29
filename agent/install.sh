#!/bin/bash
#
# Sentinel Agent Installation Script
# Installs agent on remote Linux server
#

set -euo pipefail

AGENT_DIR="/opt/sentinel-agent"
SYSTEMD_DIR="/etc/systemd/system"
SERVICE_NAME="sentinel-agent.service"

echo "🚀 Sentinel Agent Installation"
echo "=============================="
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo "ERROR: This script must be run as root (use sudo)" >&2
  exit 1
fi

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Check if agent.sh exists
if [ ! -f "$SCRIPT_DIR/agent.sh" ]; then
  echo "ERROR: agent.sh not found in $SCRIPT_DIR" >&2
  exit 1
fi

# Create agent directory
echo "📁 Creating agent directory..."
mkdir -p "$AGENT_DIR"

# Copy agent files
echo "📋 Copying agent files..."
cp "$SCRIPT_DIR/agent.sh" "$AGENT_DIR/agent.sh"
chmod +x "$AGENT_DIR/agent.sh"

# Copy agent server
if [ -f "$SCRIPT_DIR/server.js" ]; then
  cp "$SCRIPT_DIR/server.js" "$AGENT_DIR/server.js"
  chmod +x "$AGENT_DIR/server.js"
  echo "✅ Copied server.js"
elif [ -f "$SCRIPT_DIR/agent-server.js" ]; then
  cp "$SCRIPT_DIR/agent-server.js" "$AGENT_DIR/server.js"
  chmod +x "$AGENT_DIR/server.js"
  echo "✅ Copied agent-server.js as server.js"
fi

# Check if config.json exists
if [ -f "$SCRIPT_DIR/config.json" ]; then
  cp "$SCRIPT_DIR/config.json" "$AGENT_DIR/config.json"
  chmod 600 "$AGENT_DIR/config.json"
  echo "✅ Using existing config.json"
else
  # Create config from example
  if [ -f "$SCRIPT_DIR/config.json.example" ]; then
    cp "$SCRIPT_DIR/config.json.example" "$AGENT_DIR/config.json"
    chmod 600 "$AGENT_DIR/config.json"
    echo "⚠️  Created config.json from example - PLEASE EDIT IT!"
    echo "   Edit: $AGENT_DIR/config.json"
    echo "   Set: serverId, secret, hqUrl"
  else
    echo "ERROR: config.json not found and no example available" >&2
    exit 1
  fi
fi

# Check dependencies
echo ""
echo "🔍 Checking dependencies..."

# Check jq
if ! command -v jq &> /dev/null; then
  echo "⚠️  jq not found - installing..."
  if command -v apt-get &> /dev/null; then
    apt-get update && apt-get install -y jq
  elif command -v yum &> /dev/null; then
    yum install -y jq
  elif command -v dnf &> /dev/null; then
    dnf install -y jq
  else
    echo "ERROR: Cannot install jq automatically. Please install jq manually." >&2
    exit 1
  fi
fi

# Check curl
if ! command -v curl &> /dev/null; then
  echo "⚠️  curl not found - installing..."
  if command -v apt-get &> /dev/null; then
    apt-get update && apt-get install -y curl
  elif command -v yum &> /dev/null; then
    yum install -y curl
  elif command -v dnf &> /dev/null; then
    dnf install -y curl
  else
    echo "ERROR: Cannot install curl automatically. Please install curl manually." >&2
    exit 1
  fi
fi

# Check fail2ban-client
if ! command -v fail2ban-client &> /dev/null; then
  echo "⚠️  WARNING: fail2ban-client not found. Agent will fail until fail2ban is installed." >&2
fi

# Check Node.js (required for agent-server.js)
if ! command -v node &> /dev/null; then
  echo "⚠️  Node.js not found - installing..."
  if command -v apt-get &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
    apt-get install -y nodejs
  elif command -v yum &> /dev/null; then
    curl -fsSL https://rpm.nodesource.com/setup_18.x | bash -
    yum install -y nodejs
  elif command -v dnf &> /dev/null; then
    curl -fsSL https://rpm.nodesource.com/setup_18.x | bash -
    dnf install -y nodejs
  else
    echo "ERROR: Cannot install Node.js automatically. Please install Node.js 18+ manually." >&2
    exit 1
  fi
fi

# Verify Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  echo "ERROR: Node.js 18+ is required. Current version: $(node -v)" >&2
  exit 1
fi

# Install systemd service
echo ""
echo "⚙️  Installing systemd service..."

# Agent push service (oneshot)
cat > "$SYSTEMD_DIR/$SERVICE_NAME" <<EOF
[Unit]
Description=Sentinel Agent - Fail2Ban Data Collector
After=network.target

[Service]
Type=oneshot
ExecStart=$AGENT_DIR/agent.sh
User=root
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# Agent timer for periodic push
cat > "$SYSTEMD_DIR/sentinel-agent.timer" <<EOF
[Unit]
Description=Sentinel Agent Timer
Requires=sentinel-agent.service

[Timer]
OnBootSec=1min
OnUnitActiveSec=30s
AccuracySec=1s

[Install]
WantedBy=timers.target
EOF

# Agent server service (listener)
if [ -f "$SCRIPT_DIR/server.js" ] || [ -f "$AGENT_DIR/server.js" ]; then
  cat > "$SYSTEMD_DIR/sentinel-agent-server.service" <<EOF
[Unit]
Description=Sentinel Agent Server - Action Listener
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/node $AGENT_DIR/server.js
Restart=always
RestartSec=10
User=root
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF
  echo "✅ Created sentinel-agent-server.service"
fi

# Reload systemd
systemctl daemon-reload

# Enable and start timer (push)
systemctl enable sentinel-agent.timer
systemctl start sentinel-agent.timer

# Enable and start server (listener)
if [ -f "$SCRIPT_DIR/server.js" ] || [ -f "$AGENT_DIR/server.js" ]; then
  systemctl enable sentinel-agent-server.service
  systemctl start sentinel-agent-server.service
  echo "✅ Started agent server"
  
  # Check if ufw is installed and add rule
  if command -v ufw &> /dev/null; then
    AGENT_PORT=$(jq -r '.listenPort // .port // 4040' "$AGENT_DIR/config.json" 2>/dev/null || echo "4040")
    echo "🔥 Opening firewall port $AGENT_PORT for agent server..."
    ufw allow "$AGENT_PORT/tcp" comment "Sentinel Agent Server" || true
  fi
fi

echo ""
echo "✅ Installation complete!"
echo ""
echo "📋 Next steps:"
echo "   1. Edit config: $AGENT_DIR/config.json"
echo "   2. Set serverId (UUID), secret, and hqUrl"
echo "   3. Test: $AGENT_DIR/agent.sh"
echo "   4. Check status: systemctl status sentinel-agent.timer"
echo "   5. View logs: journalctl -u sentinel-agent.service -f"
echo ""

