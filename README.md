# Sentinel — The Missing Dashboard for Fail2ban

<div align="center">

![Sentinel Dashboard Logo](logo.png)

**The modern, production-ready web interface for monitoring and managing fail2ban**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)](https://github.com/Pepinko81/sentinel-view/releases)

*Stop managing fail2ban from the command line. Get real-time visibility into your security infrastructure.*

</div>

---

## Why Sentinel?

Fail2ban is powerful, but monitoring it requires SSH access and command-line expertise. **Sentinel** bridges that gap by providing a beautiful, real-time web dashboard that gives you instant visibility into your security infrastructure.

Whether you're managing a single server or a fleet of systems, Sentinel makes fail2ban monitoring accessible, actionable, and secure.

## Screenshots

![Dashboard Overview](./screenshots/overview.png)
*Real-time overview of all jails, active bans, and security metrics*

![Ban Management](./screenshots/bans.png)
*View active bans, ban history, and manage IP addresses with one click*

![Live Logs](./screenshots/logs.png)
*Stream fail2ban logs in real-time via WebSocket*

## Features

### Core Functionality
- **🔴 Live Fail2ban Dashboard** — Real-time monitoring of all jails and active bans
- **📊 View Active & Historical Bans** — See current bans and complete ban history with filtering
- **🚫 One-Click Unban** — Quickly unban IP addresses from any jail
- **⚙️ Enable/Disable Jails** — Start, stop, and restart fail2ban jails from the UI
- **🔧 Create Filters** — Build and manage fail2ban filters through the web interface
- **🔄 Restart Fail2ban** — Restart the fail2ban service with a single click
- **📡 WebSocket Live Logs** — Stream fail2ban logs in real-time

### Security & Production Features
- **🔐 JWT Authentication** — Secure token-based authentication with automatic rotation
- **🛡️ Rate Limiting** — Fail2ban-style rate limiting (5 login attempts / 10 min)
- **🚨 Brute Force Protection** — Automatic account lockout after failed attempts
- **🌐 IP Allowlist** — Optional IP-based access control
- **⚡ Production Ready** — Systemd services, Docker support, automated installation

## Installation

### Option A: Automated Installer (Recommended)

The fastest way to get started:

```bash
curl -s https://raw.githubusercontent.com/Pepinko81/sentinel-view/main/install.sh | sudo bash
```

Or download and run locally:

```bash
git clone https://github.com/Pepinko81/sentinel-view.git
cd sentinel-view
sudo ./install.sh
```

**What the installer does:**
- Detects your OS (Ubuntu 20.04–24.04, Debian)
- Installs Node.js, nginx, and fail2ban (if missing)
- Installs Sentinel to `/opt/sentinel`
- Configures systemd services
- Sets up environment variables
- Starts services automatically

**After installation:**
- Backend API: `http://your-server:3010`
- Frontend UI: `http://your-server:8080`
- Check status: `sudo systemctl status sentinel-backend`

### Option B: Docker

Deploy using Docker Compose:

```bash
cd docker
docker-compose up -d
```

**Services:**
- Backend API: `http://localhost:3010`
- Frontend UI: `http://localhost:8080`

For detailed Docker instructions, see [docker/README.md](docker/README.md).

## Quick Start

1. **Install Sentinel** (see Installation above)

2. **Access the dashboard:**
   - Open `http://your-server:8080` in your browser
   - Login with your password (set in `AUTH_TOKEN` env var)

3. **Start monitoring:**
   - View all jails and active bans
   - Monitor ban history
   - Manage jails and IPs

## Service Management

When installed via the installer, Sentinel runs as systemd services:

```bash
# Check status
sudo systemctl status sentinel-backend
sudo systemctl status sentinel-frontend

# Restart services
sudo systemctl restart sentinel-backend
sudo systemctl restart sentinel-frontend

# View logs
sudo journalctl -u sentinel-backend -f
```

## Troubleshooting

### Backend won't start
- Check logs: `sudo journalctl -u sentinel-backend -n 50`
- Verify fail2ban is running: `sudo systemctl status fail2ban`
- Check permissions: `sudo chmod 644 /opt/sentinel/backend/.env`

### Frontend shows connection errors
- Verify backend is running: `curl http://localhost:3010/health`
- Check CORS settings in `backend/.env`
- Ensure firewall allows port 3010 and 8080

### Can't access fail2ban data
- Verify sudoers configuration: `sudo visudo -f /etc/sudoers.d/sentinel-backend`
- Check fail2ban database permissions: `ls -la /var/lib/fail2ban/fail2ban.sqlite3`

### Installation fails
- Ensure you're running as root: `sudo ./install.sh`
- Check OS compatibility (Ubuntu 20.04+ or Debian)
- Review installer output for specific errors

## Configuration

### Environment Variables

Key configuration options in `backend/.env`:

```env
# Authentication
AUTH_ENABLED=true
AUTH_TOKEN=your-secure-password-here

# JWT Settings
JWT_SECRET=your-jwt-secret-here
JWT_EXPIRES=1h

# Rate Limiting
RATE_LIMIT_LOGIN=5
RATE_LIMIT_API=100

# IP Allowlist (optional)
ALLOWLIST=192.168.0.0/24,10.0.0.1
```

See `backend/.env.example` for all available options.

## Security

Sentinel implements multiple security layers:

- **JWT Authentication** with token rotation (1h access tokens, 7d refresh tokens)
- **Rate Limiting** on login (5 attempts / 10 minutes) and API (100 requests / minute)
- **Brute Force Protection** with automatic lockout
- **IP Allowlist** for additional access control
- **WebSocket Authentication** for secure log streaming

**Best Practices:**
- Use strong, unique passwords and tokens
- Enable IP allowlist in production
- Use HTTPS in production environments
- Regularly update dependencies
- Review script execution permissions

## Uninstallation

To remove Sentinel:

```bash
sudo ./uninstall.sh
```

This will:
- Stop and disable systemd services
- Remove installation files
- Optionally keep ban history and configuration (prompted)

## Project Structure

```
sentinel-view/
├── backend/          # Node.js API server
├── src/             # React frontend
├── deployment/      # Systemd service files
├── docker/          # Docker deployment files
├── install.sh       # Automated installer
└── uninstall.sh     # Removal script
```

## Documentation

- **Backend API**: See `backend/README.md`
- **Configuration**: See `backend/docs/ENVIRONMENT-CONFIG.md`
- **Deployment**: See `docs/DEPLOYMENT.md`
- **Docker**: See `docker/README.md`

## Support

**Free Community Support:**
- Open an issue on [GitHub](https://github.com/Pepinko81/sentinel-view/issues)
- Check existing issues and discussions
- Review documentation in `docs/` directory

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

<div align="center">

**Built by [Pepinko](https://github.com/Pepinko81)**

[Report Bug](https://github.com/Pepinko81/sentinel-view/issues) · [Request Feature](https://github.com/Pepinko81/sentinel-view/issues) · [View Releases](https://github.com/Pepinko81/sentinel-view/releases)

</div>
