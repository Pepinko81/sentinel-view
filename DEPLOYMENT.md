# Fail2ban Dashboard - Deployment Guide

**Version:** 2.0.0  
**Last Updated:** 2024-12-26

## Overview

This is a full-control GUI wrapper for fail2ban that runs on the same machine where fail2ban is installed. It requires system-level access and uses sudo for all fail2ban operations.

### Version 2.0.0 Features

- Full jail configuration management (read/write from jail.conf, jail.local, jail.d)
- Automatic jail configuration validation (log file existence, syntax checking)
- Improved graceful shutdown handling
- Enhanced error messages for configuration issues
- Support for jails defined in default jail.conf

## Prerequisites

- Node.js >= 18.0.0
- fail2ban installed and configured
- sudo access with NOPASSWD configured (see below)
- better-sqlite3 system dependencies (for SQLite database access)

## Sudoers Configuration

### Overview

The backend requires passwordless sudo access to execute fail2ban commands. This is necessary because:
- fail2ban commands require root privileges
- The backend needs to read/write configuration files in `/etc/fail2ban/`
- Systemctl commands require root to manage the fail2ban service
- Log file access requires root for `/var/log/fail2ban.log`

### Step-by-Step Configuration

#### 1. Identify Your User

First, determine which user will run the Node.js backend:

```bash
whoami
# Example output: pepinko
```

#### 2. Create Sudoers File

Create a new sudoers configuration file (requires root):

```bash
sudo nano /etc/sudoers.d/fail2ban-dashboard
```

**Important**: Always use `visudo` or edit files in `/etc/sudoers.d/` - never edit `/etc/sudoers` directly!

#### 3. Add Configuration

Replace `your-user` with your actual username (e.g., `pepinko`):

```bash
# Fail2ban Dashboard - Passwordless sudo configuration
# User running the Node.js backend
# Replace 'your-user' with your actual username

# Fail2ban client commands
your-user ALL=(ALL) NOPASSWD: /usr/bin/fail2ban-client
your-user ALL=(ALL) NOPASSWD: /usr/bin/fail2ban-regex

# Systemctl commands for fail2ban service management
your-user ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart fail2ban
your-user ALL=(ALL) NOPASSWD: /usr/bin/systemctl start fail2ban
your-user ALL=(ALL) NOPASSWD: /usr/bin/systemctl stop fail2ban
your-user ALL=(ALL) NOPASSWD: /usr/bin/systemctl status fail2ban

# Log file access (for live log streaming)
your-user ALL=(ALL) NOPASSWD: /usr/bin/tail -F /var/log/fail2ban.log
your-user ALL=(ALL) NOPASSWD: /usr/bin/tail -F -n 100 /var/log/fail2ban.log

# File operations for filter and jail configuration
# Note: These allow copying from /tmp/ to fail2ban directories
# Using /tmp/ is safer and more standard than project-specific paths
your-user ALL=(ALL) NOPASSWD: /bin/cp /tmp/fail2ban-* /etc/fail2ban/filter.d/*
your-user ALL=(ALL) NOPASSWD: /bin/cp /tmp/fail2ban-* /etc/fail2ban/jail.d/*
your-user ALL=(ALL) NOPASSWD: /bin/cp /tmp/fail2ban-* /etc/fail2ban/jail.local
your-user ALL=(ALL) NOPASSWD: /bin/chmod 644 /etc/fail2ban/filter.d/*
your-user ALL=(ALL) NOPASSWD: /bin/chmod 644 /etc/fail2ban/jail.d/*
your-user ALL=(ALL) NOPASSWD: /bin/chmod 644 /etc/fail2ban/jail.local
your-user ALL=(ALL) NOPASSWD: /bin/mkdir -p /etc/fail2ban/jail.d
your-user ALL=(ALL) NOPASSWD: /usr/bin/cat /etc/fail2ban/jail.local
your-user ALL=(ALL) NOPASSWD: /usr/bin/cat /etc/fail2ban/jail.d/*
```

#### 4. Set Correct Permissions

The sudoers file must have specific permissions:

```bash
sudo chmod 0440 /etc/sudoers.d/fail2ban-dashboard
sudo chown root:root /etc/sudoers.d/fail2ban-dashboard
```

#### 5. Validate Configuration

Test the sudoers syntax (prevents locking yourself out):

```bash
sudo visudo -c -f /etc/sudoers.d/fail2ban-dashboard
```

Expected output: `parsing OK` or `syntax OK`

#### 6. Test Passwordless Access

Test that passwordless sudo works:

```bash
# Test fail2ban-client (should work without password)
sudo -n /usr/bin/fail2ban-client status

# Test systemctl (should work without password)
sudo -n /usr/bin/systemctl status fail2ban

# If these work without prompting for password, configuration is correct
```

### What Each Command Does

| Command | Purpose | Why Needed |
|---------|---------|------------|
| `/usr/bin/fail2ban-client` | Execute fail2ban commands (status, start, stop, unban) | Core functionality - all jail operations |
| `/usr/bin/fail2ban-regex` | Validate filter regex patterns | Filter creation validation |
| `/usr/bin/systemctl restart fail2ban` | Restart fail2ban service | Apply configuration changes |
| `/usr/bin/systemctl start/stop fail2ban` | Control fail2ban service | Service management |
| `/usr/bin/systemctl status fail2ban` | Check service status | Health monitoring |
| `/usr/bin/tail -F /var/log/fail2ban.log` | Stream log file | Live log feature |
| `/bin/cp /tmp/* /etc/fail2ban/filter.d/*` | Copy filter files | Filter creation |
| `/bin/cp /tmp/* /etc/fail2ban/jail.d/*` | Copy jail config files | Jail configuration |
| `/bin/chmod 644 /etc/fail2ban/*` | Set file permissions | Security (readable by all, writable by owner) |
| `/bin/mkdir -p /etc/fail2ban/jail.d` | Create directory | Jail config directory creation |

### Security Considerations

1. **Whitelisted Commands Only**: Only specific commands are allowed, not arbitrary shell access
2. **Input Validation**: The backend validates all inputs (jail names, IP addresses) before execution
3. **No Shell Access**: Commands are executed via `execFile`, not shell, preventing command injection
4. **File Path Restrictions**: Only specific paths are allowed (`/etc/fail2ban/filter.d/`, `/etc/fail2ban/jail.d/`)
5. **Temporary Files**: Files are created in `/tmp/` first, then copied with sudo (safer than direct writes)

### Troubleshooting

#### "sudo: a password is required"

**Problem**: Sudoers configuration not working

**Solutions**:
1. Check username is correct in sudoers file
2. Verify file permissions: `ls -l /etc/sudoers.d/fail2ban-dashboard` (should be 0440)
3. Check syntax: `sudo visudo -c -f /etc/sudoers.d/fail2ban-dashboard`
4. Ensure no typos in command paths
5. Try logging out and back in (sudoers cache)

#### "command not found"

**Problem**: Command path is incorrect

**Solutions**:
1. Find actual path: `which fail2ban-client` or `whereis fail2ban-client`
2. Update sudoers file with correct path
3. Common paths:
   - `/usr/bin/fail2ban-client` (most Linux)
   - `/usr/local/bin/fail2ban-client` (some installations)

#### "permission denied" when copying files

**Problem**: File copy commands not working

**Solutions**:
1. Check `/tmp/` is writable by your user
2. Verify target directory exists: `ls -ld /etc/fail2ban/filter.d/`
3. Check sudoers allows the exact command pattern
4. Test manually: `sudo cp /tmp/test.conf /etc/fail2ban/filter.d/test.conf`

### Alternative: More Restrictive Configuration

If you want even tighter security, you can restrict commands to specific arguments:

```bash
# More restrictive - only allow specific fail2ban-client subcommands
your-user ALL=(ALL) NOPASSWD: /usr/bin/fail2ban-client status
your-user ALL=(ALL) NOPASSWD: /usr/bin/fail2ban-client status *
your-user ALL=(ALL) NOPASSWD: /usr/bin/fail2ban-client start *
your-user ALL=(ALL) NOPASSWD: /usr/bin/fail2ban-client stop *
your-user ALL=(ALL) NOPASSWD: /usr/bin/fail2ban-client set * unbanip *
```

However, this requires updating the backend to use exact command paths, which is more complex.

### Verification Checklist

- [ ] Sudoers file created at `/etc/sudoers.d/fail2ban-dashboard`
- [ ] Username replaced with actual user
- [ ] File permissions set to 0440
- [ ] Syntax validated with `visudo -c`
- [ ] Tested passwordless sudo with `sudo -n fail2ban-client status`
- [ ] Backend can execute fail2ban commands without errors

## Installation

### 1. Install Dependencies

```bash
# Backend
cd backend
npm install

# Frontend
cd ../src
npm install
```

### 2. Configure Environment Variables

Create `.env.production` in the backend directory:

```bash
NODE_ENV=production
PORT=3002
AUTH_TOKEN=your-secure-random-token-here
SERVER_HOST=127.0.0.1  # or 0.0.0.0 for LAN access
CORS_ORIGIN=http://localhost:5173

# Fail2ban paths (defaults shown, adjust if needed)
F2B_DB=/var/lib/fail2ban/fail2ban.sqlite3
F2B_LOG=/var/log/fail2ban.log
F2B_FILTER_DIR=/etc/fail2ban/filter.d

# System paths (defaults shown, adjust if needed)
SUDO_PATH=/usr/bin/sudo
FAIL2BAN_CLIENT_PATH=/usr/bin/fail2ban-client
FAIL2BAN_REGEX_PATH=/usr/bin/fail2ban-regex
SYSTEMCTL_PATH=/usr/bin/systemctl
TAIL_PATH=/usr/bin/tail
```

### 3. Build Frontend

```bash
cd src
npm run build
```

### 4. Start Backend

```bash
cd backend
NODE_ENV=production node src/index.js
```

Or use a process manager like PM2:

```bash
pm2 start src/index.js --name fail2ban-dashboard --env production
```

## Features

### Backend API

- **GET /api/jails** - List all jails with status
- **GET /api/jails/:name** - Get detailed jail status
- **POST /api/jails/:name/start** - Start a jail
- **POST /api/jails/:name/stop** - Stop a jail
- **GET /api/jails/:name/bans** - Get banned IPs for a jail
- **GET /api/bans** - Get all active bans
- **GET /api/bans/history** - Get ban history
- **POST /api/bans/unban** - Unban an IP from a jail
- **POST /api/filters/create** - Create a new filter file
- **GET /api/jail-config/:name** - Read jail configuration
- **POST /api/jail-config/:name** - Write jail configuration
- **POST /api/system/restart** - Restart fail2ban service
- **WS /ws/logs** - WebSocket stream for live log tailing

### Frontend Pages

- **Dashboard** - Overview with stats and global Restart button
- **Jails** - List all jails with Start/Stop/Unban actions
- **Create Filter** - Create new fail2ban filter files
- **Jail Editor** - View and edit jail configuration files
- **Live Log** - Real-time fail2ban log stream via WebSocket

## Security Considerations

1. **Authentication**: The backend uses token-based authentication. Set a strong `AUTH_TOKEN` in production.

2. **CORS**: Configure `CORS_ORIGIN` to restrict frontend access in production.

3. **Network Binding**: Use `SERVER_HOST=127.0.0.1` to bind to localhost only, or `0.0.0.0` for LAN access (less secure).

4. **Sudoers**: Only grant the minimum required commands. The backend validates all inputs before execution.

5. **File Permissions**: Filter and jail config files are created with 644 permissions (readable by all, writable by owner).

## Troubleshooting

### Backend fails to start

- Check that all environment variables are set
- Verify sudoers configuration is correct
- Ensure fail2ban is installed and accessible
- Check that better-sqlite3 can access the SQLite database

### Commands fail with permission errors

- Verify sudoers configuration
- Test sudo access manually: `sudo -u your-user /usr/bin/fail2ban-client status`
- Check file permissions on `/etc/fail2ban/` directories

### WebSocket connection fails

- Verify the backend is running and WebSocket server is started
- Check firewall rules if accessing from remote machine
- Ensure WebSocket path is correct: `/ws/logs`

### Filter creation fails

- Check that `/etc/fail2ban/filter.d/` is writable via sudo
- Verify regex syntax is correct (use `fail2ban-regex` to test)
- Check backend logs for detailed error messages

## Production Deployment

1. Use a reverse proxy (nginx) for HTTPS
2. Set up systemd service for auto-start
3. Configure log rotation for backend logs
4. Monitor disk space (SQLite database can grow)
5. Set up backups for fail2ban configuration files

## Systemd Service Example

Create `/etc/systemd/system/fail2ban-dashboard.service`:

```ini
[Unit]
Description=Fail2ban Dashboard Backend
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/sentinel-view/backend
Environment=NODE_ENV=production
ExecStart=/usr/bin/node src/index.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
sudo systemctl enable fail2ban-dashboard
sudo systemctl start fail2ban-dashboard
```

## License

MIT

