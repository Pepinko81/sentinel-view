# Sentinel Dashboard

Fail2Ban Web Dashboard – Server Security Monitor

> **⚠️ SECURITY NOTICE**: This application requires system-level access to fail2ban and may execute privileged commands. 
> - Always use strong authentication tokens
> - Run in a secure network environment
> - Review and restrict script execution permissions
> - Keep dependencies updated
> - Do not expose to public internet without proper security measures

A comprehensive web-based dashboard for monitoring and managing fail2ban security configurations, active bans, and server security metrics.

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

- 🔒 **Real-time Security Monitoring**: Monitor active bans and jail status
- 📊 **Comprehensive Dashboard**: Overview of all jails, bans, and system metrics
- 🛡️ **Jail Management**: Start, stop, and configure fail2ban jails
- 📈 **Ban History**: View historical ban events and patterns
- ⚡ **Fast & Responsive**: Optimized for performance with caching
- 🔐 **Secure API**: Token-based authentication and whitelisted script execution

## Documentation

- **Backend API**: See `backend/README.md` for detailed API documentation
- **Configuration**: See `backend/docs/ENVIRONMENT-CONFIG.md` for environment setup

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT
