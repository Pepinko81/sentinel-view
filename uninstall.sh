#!/bin/bash
#
# Sentinel Dashboard v2.0 - Uninstallation Script
# Removes Sentinel Dashboard and systemd services
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

stop_services() {
    log_info "Stopping Sentinel services..."

    if systemctl is-active --quiet sentinel-backend.service 2>/dev/null; then
        systemctl stop sentinel-backend.service
        log_info "Backend service stopped"
    fi

    if systemctl is-active --quiet sentinel-frontend.service 2>/dev/null; then
        systemctl stop sentinel-frontend.service
        log_info "Frontend service stopped"
    fi
}

disable_services() {
    log_info "Disabling systemd services..."

    if systemctl is-enabled --quiet sentinel-backend.service 2>/dev/null; then
        systemctl disable sentinel-backend.service
        log_info "Backend service disabled"
    fi

    if systemctl is-enabled --quiet sentinel-frontend.service 2>/dev/null; then
        systemctl disable sentinel-frontend.service
        log_info "Frontend service disabled"
    fi

    systemctl daemon-reload
}

remove_systemd_files() {
    log_info "Removing systemd service files..."

    if [ -f "$SERVICE_DIR/sentinel-backend.service" ]; then
        rm -f "$SERVICE_DIR/sentinel-backend.service"
        log_info "Removed sentinel-backend.service"
    fi

    if [ -f "$SERVICE_DIR/sentinel-frontend.service" ]; then
        rm -f "$SERVICE_DIR/sentinel-frontend.service"
        log_info "Removed sentinel-frontend.service"
    fi

    systemctl daemon-reload
}

remove_sudoers() {
    log_info "Removing sudoers configuration..."

    if [ -f "$SUDOERS_DIR/sentinel-backend" ]; then
        rm -f "$SUDOERS_DIR/sentinel-backend"
        log_info "Removed sudoers configuration"
    fi
}

remove_installation() {
    log_info "Removing installation directory..."

    if [ -d "$INSTALL_DIR" ]; then
        read -p "Do you want to keep ban history and configuration? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            log_info "Backing up configuration and history..."
            BACKUP_DIR="${INSTALL_DIR}.backup.$(date +%Y%m%d_%H%M%S)"
            mkdir -p "$BACKUP_DIR"
            
            # Backup .env files
            if [ -f "$INSTALL_DIR/backend/.env" ]; then
                cp "$INSTALL_DIR/backend/.env" "$BACKUP_DIR/backend.env"
            fi
            
            # Backup scripts if needed
            if [ -d "$INSTALL_DIR/backend/scripts" ]; then
                cp -r "$INSTALL_DIR/backend/scripts" "$BACKUP_DIR/scripts"
            fi
            
            log_info "Backup created at: $BACKUP_DIR"
        fi

        rm -rf "$INSTALL_DIR"
        log_info "Installation directory removed"
    else
        log_warn "Installation directory not found: $INSTALL_DIR"
    fi
}

print_summary() {
    echo ""
    log_info "=========================================="
    log_info "Sentinel Dashboard Uninstallation Complete!"
    log_info "=========================================="
    echo ""
    log_info "All Sentinel Dashboard files and services have been removed."
    echo ""
    log_warn "Note: Dependencies (Node.js, nginx, fail2ban) were NOT removed."
    log_warn "If you want to remove them, do it manually."
    echo ""
}

# Main uninstallation flow
main() {
    log_info "Starting Sentinel Dashboard v2.0 uninstallation..."
    echo ""

    check_root
    
    read -p "Are you sure you want to uninstall Sentinel Dashboard? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Uninstallation cancelled."
        exit 0
    fi

    stop_services
    disable_services
    remove_systemd_files
    remove_sudoers
    remove_installation
    print_summary
}

# Run main function
main "$@"

