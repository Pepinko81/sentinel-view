#!/bin/bash
#
# Sentinel Dashboard v2.0 - Installation Script
# Installs Sentinel Dashboard with systemd services
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Installation paths
INSTALL_DIR="/opt/sentinel"
SERVICE_DIR="/etc/systemd/system"
SUDOERS_DIR="/etc/sudoers.d"

# Functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_root() {
    if [ "$EUID" -ne 0 ]; then
        log_error "Please run as root (use sudo)"
        exit 1
    fi
}

detect_os() {
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS=$ID
        OS_VERSION=$VERSION_ID
    else
        log_error "Cannot detect OS. This script supports Ubuntu/Debian only."
        exit 1
    fi

    if [[ "$OS" != "ubuntu" && "$OS" != "debian" ]]; then
        log_error "Unsupported OS: $OS. This script supports Ubuntu/Debian only."
        exit 1
    fi

    log_info "Detected OS: $OS $OS_VERSION"
}

install_dependencies() {
    log_info "Updating package lists..."
    apt-get update -qq

    log_info "Installing dependencies..."
    
    # Check and install Node.js
    if ! command -v node &> /dev/null; then
        log_info "Installing Node.js..."
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
        apt-get install -y nodejs
    else
        NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
        if [ "$NODE_VERSION" -lt 18 ]; then
            log_warn "Node.js version is too old. Installing Node.js 20..."
            curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
            apt-get install -y nodejs
        else
            log_info "Node.js $(node -v) is already installed"
        fi
    fi

    # Check and install nginx
    if ! command -v nginx &> /dev/null; then
        log_info "Installing nginx..."
        apt-get install -y nginx
        systemctl enable nginx
    else
        log_info "nginx is already installed"
    fi

    # Check and install fail2ban
    if ! command -v fail2ban-client &> /dev/null; then
        log_info "Installing fail2ban..."
        apt-get install -y fail2ban
        systemctl enable fail2ban
        systemctl start fail2ban
    else
        log_info "fail2ban is already installed"
    fi

    # Install other dependencies
    apt-get install -y git curl build-essential
}

install_sentinel() {
    log_info "Installing Sentinel Dashboard to $INSTALL_DIR..."

    # Check if already installed
    if [ -d "$INSTALL_DIR" ]; then
        log_warn "Installation directory exists. Backing up..."
        BACKUP_DIR="${INSTALL_DIR}.backup.$(date +%Y%m%d_%H%M%S)"
        mv "$INSTALL_DIR" "$BACKUP_DIR"
        log_info "Backup created at: $BACKUP_DIR"
    fi

    # Determine installation method
    if [ -d ".git" ] && [ -f "package.json" ]; then
        log_info "Installing from local repository..."
        mkdir -p "$INSTALL_DIR"
        cp -r . "$INSTALL_DIR/"
        # Remove unnecessary files
        rm -rf "$INSTALL_DIR/.git" "$INSTALL_DIR/node_modules" "$INSTALL_DIR/backend/node_modules"
    else
        log_info "Cloning from repository..."
        if [ -z "$REPO_URL" ]; then
            REPO_URL="https://github.com/Pepinko81/sentinel-view.git"
        fi
        git clone "$REPO_URL" "$INSTALL_DIR" || {
            log_error "Failed to clone repository. Please provide REPO_URL or install from local directory."
            exit 1
        }
    fi

    # Install backend dependencies
    log_info "Installing backend dependencies..."
    cd "$INSTALL_DIR/backend"
    npm install --production

    # Install frontend dependencies and build
    log_info "Installing frontend dependencies..."
    cd "$INSTALL_DIR"
    npm install
    log_info "Building frontend..."
    npm run build

    # Create nginx config for frontend service
    log_info "Creating frontend nginx configuration..."
    cat > "$INSTALL_DIR/nginx-frontend.conf" <<'NGINX_EOF'
events {
    worker_connections 1024;
}
http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;
    sendfile on;
    keepalive_timeout 65;
    
    server {
        listen 8080;
        server_name _;
        root /opt/sentinel/dist;
        index index.html;

        location / {
            try_files $uri $uri/ /index.html;
        }

        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }
}
NGINX_EOF
    chmod 644 "$INSTALL_DIR/nginx-frontend.conf"

    # Set permissions
    chown -R root:root "$INSTALL_DIR"
    chmod -R 755 "$INSTALL_DIR"
    chmod 644 "$INSTALL_DIR/backend/.env" 2>/dev/null || true
}

setup_environment() {
    log_info "Setting up environment configuration..."

    # Create backend .env if it doesn't exist
    if [ ! -f "$INSTALL_DIR/backend/.env" ]; then
        log_info "Creating backend .env file..."
        cat > "$INSTALL_DIR/backend/.env" <<EOF
# Sentinel Dashboard Backend Configuration
NODE_ENV=production
SERVER_HOST=0.0.0.0
SERVER_PORT=3010
SCRIPTS_DIR=$INSTALL_DIR/backend/scripts

# Authentication
AUTH_ENABLED=true
AUTH_TOKEN=$(openssl rand -hex 32)
AUTH_SECRET=$(openssl rand -hex 32)

# Fail2ban
FAIL2BAN_DB=/var/lib/fail2ban/fail2ban.sqlite3
FAIL2BAN_LOG=/var/log/fail2ban.log

# CORS (adjust for your setup)
CORS_ORIGIN=http://localhost:8080
EOF
        chmod 600 "$INSTALL_DIR/backend/.env"
        log_warn "Generated new AUTH_TOKEN and AUTH_SECRET. Please update them in $INSTALL_DIR/backend/.env"
    else
        log_info "Backend .env already exists, skipping..."
    fi

    # Update SCRIPTS_DIR in .env if needed
    if grep -q "SCRIPTS_DIR=" "$INSTALL_DIR/backend/.env"; then
        sed -i "s|SCRIPTS_DIR=.*|SCRIPTS_DIR=$INSTALL_DIR/backend/scripts|" "$INSTALL_DIR/backend/.env"
    else
        echo "SCRIPTS_DIR=$INSTALL_DIR/backend/scripts" >> "$INSTALL_DIR/backend/.env"
    fi
}

setup_sudoers() {
    log_info "Setting up sudoers configuration..."

    if [ -f "$INSTALL_DIR/backend/sudoers.d/sentinel-backend" ]; then
        cp "$INSTALL_DIR/backend/sudoers.d/sentinel-backend" "$SUDOERS_DIR/sentinel-backend"
        chmod 440 "$SUDOERS_DIR/sentinel-backend"
        log_info "Sudoers configuration installed"
    else
        log_warn "Sudoers file not found. You may need to configure sudo access manually."
    fi
}

setup_systemd() {
    log_info "Setting up systemd services..."

    # Copy service files
    if [ -f "$INSTALL_DIR/deployment/systemd/sentinel-backend.service" ]; then
        cp "$INSTALL_DIR/deployment/systemd/sentinel-backend.service" "$SERVICE_DIR/"
        log_info "Backend service file installed"
    else
        log_error "Backend service file not found!"
        exit 1
    fi

    if [ -f "$INSTALL_DIR/deployment/systemd/sentinel-frontend.service" ]; then
        cp "$INSTALL_DIR/deployment/systemd/sentinel-frontend.service" "$SERVICE_DIR/"
        log_info "Frontend service file installed"
    else
        log_warn "Frontend service file not found. Skipping frontend service."
    fi

    # Reload systemd
    systemctl daemon-reload

    # Enable services
    systemctl enable sentinel-backend.service
    if [ -f "$SERVICE_DIR/sentinel-frontend.service" ]; then
        systemctl enable sentinel-frontend.service
    fi

    log_info "Systemd services configured and enabled"
}

start_services() {
    log_info "Starting Sentinel services..."

    systemctl start sentinel-backend.service
    sleep 2

    if systemctl is-active --quiet sentinel-backend.service; then
        log_info "Backend service started successfully"
    else
        log_error "Backend service failed to start. Check logs: journalctl -u sentinel-backend -n 50"
    fi

    if [ -f "$SERVICE_DIR/sentinel-frontend.service" ]; then
        systemctl start sentinel-frontend.service
        sleep 2

        if systemctl is-active --quiet sentinel-frontend.service; then
            log_info "Frontend service started successfully"
        else
            log_warn "Frontend service failed to start. Check logs: journalctl -u sentinel-frontend -n 50"
        fi
    fi
}

print_summary() {
    echo ""
    log_info "=========================================="
    log_info "Sentinel Dashboard Installation Complete!"
    log_info "=========================================="
    echo ""
    echo "Installation directory: $INSTALL_DIR"
    echo "Backend service: sentinel-backend"
    echo "Frontend service: sentinel-frontend (if configured)"
    echo ""
    
    # Get server IP/hostname
    SERVER_IP=$(hostname -I | awk '{print $1}' 2>/dev/null || echo "localhost")
    if [ -z "$SERVER_IP" ] || [ "$SERVER_IP" = "127.0.0.1" ]; then
        SERVER_IP="localhost"
    fi
    
    echo "✅ Sentinel installed successfully"
    echo ""
    echo "Access your dashboard:"
    echo "  Backend API: http://$SERVER_IP:3010"
    echo "  Frontend UI: http://$SERVER_IP:8080"
    echo ""
    echo "Useful commands:"
    echo "  sudo systemctl status sentinel-backend"
    echo "  sudo systemctl restart sentinel-backend"
    echo "  sudo journalctl -u sentinel-backend -f"
    echo ""
    log_warn "IMPORTANT: Update AUTH_TOKEN in $INSTALL_DIR/backend/.env before production use!"
    echo ""
}

# Main installation flow
main() {
    log_info "Starting Sentinel Dashboard v2.0 installation..."
    echo ""

    check_root
    detect_os
    install_dependencies
    install_sentinel
    setup_environment
    setup_sudoers
    setup_systemd
    start_services
    print_summary
}

# Run main function
main "$@"

