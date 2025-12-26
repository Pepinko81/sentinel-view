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

### Installation

1. **Clone the repository:**

```sh
git clone <YOUR_GIT_URL>
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
