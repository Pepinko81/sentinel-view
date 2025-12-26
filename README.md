# Sentinel Dashboard

<div align="center">

![Sentinel Dashboard Logo](logo.png)

**Fail2Ban Web Dashboard – Server Security Monitor**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/version-2.0.0-blue.svg)](https://github.com/Pepinko81/sentinel-view/releases)

*A modern, production-ready web interface for monitoring and managing fail2ban security configurations*

</div>

---

## Why Sentinel?

**Sentinel Dashboard** is a comprehensive, production-ready solution for monitoring and managing your fail2ban security infrastructure. Whether you're running a single server or managing multiple systems, Sentinel provides:

- **🔍 Real-Time Monitoring**: See active bans, jail status, and security events as they happen
- **🛡️ Centralized Management**: Control all your fail2ban jails from a single, intuitive interface
- **📊 Security Insights**: Track ban patterns, identify threats, and analyze security trends
- **⚡ Production Ready**: Automated installation, systemd services, Docker support, and enterprise-grade security
- **🔐 Secure by Default**: JWT authentication, rate limiting, IP allowlists, and brute force protection

Perfect for system administrators, DevOps teams, and security professionals who need a reliable, secure way to monitor and manage fail2ban across their infrastructure.

---

> **⚠️ SECURITY NOTICE**: This application requires system-level access to fail2ban and may execute privileged commands. 
> - Always use strong authentication tokens
> - Run in a secure network environment
> - Review and restrict script execution permissions
> - Keep dependencies updated
> - Do not expose to public internet without proper security measures

## Project Overview

Sentinel Dashboard provides a modern, real-time interface for monitoring fail2ban jails, active IP bans, ban history, and server security statistics. Built with React, TypeScript, and a secure Node.js backend.

## Technologies

This project is built with:

- **Frontend**: Vite, TypeScript, React, shadcn-ui, Tailwind CSS
- **Backend**: Node.js, Express, fail2ban CLI integration
- **State Management**: React Query (TanStack Query)
- **UI Components**: Radix UI, shadcn/ui

## Getting Started

### Prerequisites

- Node.js >= 18.0.0
- npm or yarn
- fail2ban installed and running (for backend)
- Ubuntu/Debian Linux (for installer script)

### Installation

#### Option 1: Automated Installation (Recommended)

The easiest way to install Sentinel Dashboard is using the automated installer:

```bash
curl -s https://raw.githubusercontent.com/Pepinko81/sentinel-view/main/install.sh | sudo bash
```

Or download and run locally:

```bash
git clone https://github.com/Pepinko81/sentinel-view.git
cd sentinel-view
sudo ./install.sh
```

The installer will:
- Detect your OS (Ubuntu/Debian)
- Install Node.js, nginx, and fail2ban (if missing)
- Clone/install Sentinel Dashboard to `/opt/sentinel`
- Configure systemd services
- Set up environment variables
- Start services automatically

#### Option 2: Manual Installation

1. **Clone the repository:**

```sh
git clone https://github.com/Pepinko81/sentinel-view.git
cd sentinel-view
```

2. **Install frontend dependencies:**

```sh
npm install
```

3. **Install backend dependencies:**

```sh
cd backend
npm install
```

4. **Configure environment:**

See `backend/README.md` for detailed backend configuration instructions.

### Development

**Frontend:**
```sh
npm run dev
```

**Backend:**
```sh
cd backend
npm run dev
```

The frontend will be available at `http://localhost:8080` and the backend at `http://localhost:3010`.

### Building for Production

**Frontend:**
```sh
npm run build
```

**Backend:**
```sh
cd backend
npm start
```

## Deployment

### Systemd Services

When installed via the installer script, Sentinel Dashboard runs as systemd services:

**Service Management:**
```bash
# Check status
sudo systemctl status sentinel-backend
sudo systemctl status sentinel-frontend

# Start services
sudo systemctl start sentinel-backend
sudo systemctl start sentinel-frontend

# Restart services
sudo systemctl restart sentinel-backend
sudo systemctl restart sentinel-frontend

# Stop services
sudo systemctl stop sentinel-backend
sudo systemctl stop sentinel-frontend

# View logs
sudo journalctl -u sentinel-backend -f
sudo journalctl -u sentinel-frontend -f

# Enable auto-start on boot
sudo systemctl enable sentinel-backend
sudo systemctl enable sentinel-frontend
```

**Service Files:**
- Backend: `/etc/systemd/system/sentinel-backend.service`
- Frontend: `/etc/systemd/system/sentinel-frontend.service`

### Docker Deployment

Sentinel Dashboard can also be deployed using Docker:

**Quick Start:**
```bash
cd docker
docker-compose up -d
```

**Services:**
- Backend API: `http://localhost:3010`
- Frontend UI: `http://localhost:8080`

For detailed Docker deployment instructions, see [docker/README.md](docker/README.md).

### Uninstallation

To remove Sentinel Dashboard:

```bash
sudo ./uninstall.sh
```

This will:
- Stop and disable systemd services
- Remove installation files from `/opt/sentinel`
- Optionally keep ban history and configuration (prompted)

## Project Structure

```
sentinel-view/
├── src/                    # Frontend React application
│   ├── components/         # React components
│   ├── pages/             # Page components
│   ├── hooks/             # Custom React hooks
│   ├── lib/               # Utilities and API service
│   └── types/             # TypeScript type definitions
├── backend/               # Node.js backend API
│   ├── src/              # Backend source code
│   └── scripts/           # Whitelisted bash scripts
├── deployment/            # Deployment files
│   └── systemd/          # Systemd service files
├── docker/               # Docker deployment files
│   ├── Dockerfile.backend
│   ├── Dockerfile.frontend
│   └── docker-compose.yml
├── install.sh            # Automated installer script
├── uninstall.sh          # Uninstallation script
└── public/                # Static assets
```

## Features

### Core Features
- 🔒 **Real-time Security Monitoring**: Monitor active bans and jail status in real-time
- 📊 **Comprehensive Dashboard**: Overview of all jails, bans, and system metrics
- 🛡️ **Jail Management**: Start, stop, and configure fail2ban jails from the UI
- 📈 **Ban History**: View historical ban events and patterns with detailed filtering
- 🚫 **IP Unban**: Quickly unban IP addresses from any jail
- 📝 **Live Log Streaming**: Real-time fail2ban log streaming via WebSocket
- 🔧 **Filter Management**: Create and manage fail2ban filters through the UI
- ⚡ **Fast & Responsive**: Optimized for performance with intelligent caching

### Security Features
- 🔐 **JWT Authentication**: Secure token-based authentication with rotation
- 🔄 **Refresh Tokens**: Long-lived refresh tokens with automatic renewal
- 🛡️ **Rate Limiting**: Fail2ban-style rate limiting (login: 5/10min, API: 100/min)
- 🚫 **Brute Force Protection**: Automatic account lockout after failed attempts
- 🌐 **IP Allowlist**: Optional IP-based access control
- 🔒 **WebSocket Authentication**: Secure log streaming with token verification
- 🚨 **Security Logging**: Comprehensive security event logging

### Deployment Features
- 📦 **Automated Installer**: One-command installation for Ubuntu/Debian
- 🔧 **Systemd Services**: Production-ready systemd service files
- 🐳 **Docker Support**: Complete Docker deployment with docker-compose
- 🔄 **Easy Updates**: Simple update process with backup support
- 🗑️ **Clean Uninstall**: Removal script with optional data backup

## Security

Sentinel Dashboard implements multiple layers of security:

### Authentication & Authorization
- **JWT Tokens**: Short-lived access tokens (1 hour) with automatic rotation
- **Refresh Tokens**: Long-lived refresh tokens (7 days) stored in HttpOnly cookies
- **Password Protection**: Secure password-based authentication
- **IP Allowlist**: Optional IP-based access control for additional security

### Rate Limiting
- **Login Endpoint**: 5 attempts per 10 minutes (configurable)
- **API Endpoints**: 100 requests per minute per IP (configurable)
- **Brute Force Protection**: Automatic lockout after 5 failed attempts (15-minute lockout)

### Network Security
- **CORS Protection**: Configurable CORS origins
- **IP Allowlist**: Block all non-allowlisted IPs (optional)
- **WebSocket Authentication**: All WebSocket connections require valid tokens

### Best Practices
- Always use strong, unique passwords and tokens
- Enable IP allowlist in production environments
- Use HTTPS in production
- Regularly update dependencies
- Review and restrict script execution permissions
- Monitor security logs regularly

For detailed security configuration, see `backend/.env.example`.

## Documentation

- **Backend API**: See `backend/README.md` for detailed API documentation
- **Configuration**: See `backend/docs/ENVIRONMENT-CONFIG.md` for environment setup
- **Deployment**: See `docs/DEPLOYMENT.md` for deployment guides
- **Docker**: See `docker/README.md` for Docker deployment instructions

## Contributing

We welcome contributions! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Commit your changes (`git commit -m 'Add some amazing feature'`)
5. Push to the branch (`git push origin feature/amazing-feature`)
6. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- Built with [React](https://reactjs.org/), [TypeScript](https://www.typescriptlang.org/), and [Node.js](https://nodejs.org/)
- UI components from [shadcn/ui](https://ui.shadcn.com/)
- Icons from [Lucide](https://lucide.dev/)

---

<div align="center">

**Sentinel Dashboard v2.0.0** - Production Ready

[Report Bug](https://github.com/Pepinko81/sentinel-view/issues) · [Request Feature](https://github.com/Pepinko81/sentinel-view/issues)

</div>
