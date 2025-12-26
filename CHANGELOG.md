# Changelog

All notable changes to Sentinel Dashboard will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- JWT-based authentication with HttpOnly cookies
- Login page with password authentication
- Protected routes with automatic redirect to login
- IP allowlist support for bypassing authentication
- Authorization header fallback for cross-site scenarios
- Comprehensive environment configuration examples
- Security-focused README with setup instructions

### Changed
- Updated CORS configuration for cross-site cookie support
- Improved error handling in authentication flow
- Enhanced API client with credential support

### Security
- Implemented secure cookie-based authentication
- Added token expiration (24 hours)
- Improved CORS security settings

## [1.0.0] - Initial Release

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

### Features
- 🔒 Real-time security monitoring
- 📊 Comprehensive dashboard
- 🛡️ Jail management
- 📈 Ban history tracking
- ⚡ Fast & responsive UI
- 🔐 Secure API with authentication

