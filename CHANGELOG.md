# Changelog

All notable changes to Sentinel Dashboard will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2024-12-26 - Public Release

### Public Release Highlights
- **Automated Installer**: One-command installation for Ubuntu/Debian
- **Production Ready**: Systemd services, Docker support, comprehensive documentation
- **Security Hardening**: JWT rotation, rate limiting, brute force protection
- **UI Polish**: Clean interface, removed development artifacts
- **Public Documentation**: Complete README, landing page, marketing materials

### Added
- **Automated Installer**: One-command installation script for Ubuntu/Debian
- **Systemd Services**: Production-ready systemd service files for backend and frontend
- **Docker Support**: Complete Docker deployment with docker-compose
- **JWT Token Rotation**: Short-lived access tokens (1h) with refresh token support
- **Rate Limiting**: Fail2ban-style rate limiting for login (5/10min) and API (100/min)
- **IP Allowlist**: Optional IP-based access control
- **Brute Force Protection**: Automatic account lockout after failed login attempts
- **WebSocket Authentication**: Secure log streaming with token verification
- **Uninstall Script**: Clean removal with optional backup
- **Production Security**: Comprehensive security hardening

### Changed
- JWT expiration reduced from 24h to 1h for better security
- Enhanced authentication with refresh tokens (7d expiration)
- Improved rate limiting with configurable thresholds
- WebSocket connections now require authentication
- Better error handling and security logging

### Security
- JWT rotation with configurable expiration
- HttpOnly refresh token cookies
- Rate limiting on login endpoint (5 attempts per 10 minutes)
- API rate limiting (100 requests per minute)
- IP allowlist middleware
- Brute force protection with automatic lockout
- WebSocket authentication requirement

### Deployment
- Automated installer script (`install.sh`)
- Systemd service files for production deployment
- Docker Compose configuration
- Uninstall script with backup option
- Environment variable templates

## [1.0.0] - 2024-12-01 - Initial Prototype

### Added
- Real-time fail2ban monitoring dashboard
- Jail management (start, stop, configure)
- Ban history and IP tracking
- System overview with security metrics
- Live log streaming via WebSocket
- Filter creation and management
- Responsive UI with dark theme
- Comprehensive API backend
- Script-based fail2ban integration
- Caching layer for performance optimization
- JWT-based authentication with HttpOnly cookies
- Login page with password authentication
- Protected routes with automatic redirect to login
- IP allowlist support for bypassing authentication
- Authorization header fallback for cross-site scenarios

### Features
- 🔒 Real-time security monitoring
- 📊 Comprehensive dashboard
- 🛡️ Jail management
- 📈 Ban history tracking
- ⚡ Fast & responsive UI
- 🔐 Secure API with authentication
