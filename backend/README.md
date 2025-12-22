# Sentinel Backend API

Secure REST API backend for fail2ban/nginx security monitoring dashboard. This backend executes whitelisted bash scripts, parses their output, and serves normalized JSON data to the React frontend.

## Features

- 🔒 **Secure by Default**: Whitelist-based script execution, no arbitrary command execution
- 🚀 **Real-time Data**: Cached responses with configurable TTL
- 🔑 **Token Authentication**: Bearer token-based API security
- 📊 **Dynamic Jail Discovery**: Automatically discovers fail2ban jails (no hardcoding)
- 🛡️ **Graceful Degradation**: Continues serving partial data if services are unavailable
- ⚡ **Performance**: In-memory caching prevents excessive sudo calls

## Architecture

```
Frontend → Express API → Script Executor → Whitelisted Scripts → fail2ban/nginx
                ↓
            Parsers → JSON → Cache → Response
```

## Prerequisites

- Node.js >= 18.0.0
- fail2ban installed and running
- nginx (optional, for nginx statistics)
- sudo access configured (see Security Configuration)

## Installation

1. **Install dependencies:**

```bash
cd backend
npm install
```

2. **Configure environment:**

```bash
cp .env.example .env
# Edit .env and set AUTH_TOKEN to a secure random value
```

3. **Make scripts executable:**

```bash
chmod +x scripts/*.sh
```

## Security Configuration

### Sudoers Configuration

The backend must run as a non-root user with limited sudo permissions. Add the following to `/etc/sudoers` (use `visudo`):

```bash
# Replace 'sentinel_user' with your actual backend user
sentinel_user ALL=(ALL) NOPASSWD: /usr/bin/fail2ban-client status
sentinel_user ALL=(ALL) NOPASSWD: /usr/bin/fail2ban-client status *
sentinel_user ALL=(ALL) NOPASSWD: /opt/fail2ban-dashboard/scripts/*.sh
sentinel_user ALL=(ALL) NOPASSWD: /usr/bin/fail2ban-regex
sentinel_user ALL=(ALL) NOPASSWD: /bin/tail
sentinel_user ALL=(ALL) NOPASSWD: /bin/grep
sentinel_user ALL=(ALL) NOPASSWD: /bin/tar
```

**Important Security Notes:**

- The backend user should NOT have sudo access to modify fail2ban configuration
- Only read-only fail2ban commands are allowed
- Only whitelisted scripts in the `scripts/` directory can be executed
- Script paths are validated before execution (no path traversal possible)

### Authentication Token

Generate a secure random token for production:

```bash
# Generate a secure token
openssl rand -hex 32
```

Set it in `.env`:

```
AUTH_TOKEN=your-generated-token-here
```

## Configuration

### Environment Variables

See `.env.example` for all available configuration options:

- `PORT`: Server port (default: 3001)
- `AUTH_TOKEN`: Bearer token for API authentication
- `CACHE_TTL`: Default cache TTL in milliseconds
- `SCRIPTS_DIR`: Path to scripts directory (default: `/opt/fail2ban-dashboard/scripts`)
- `NGINX_ACCESS_LOG`: Path to nginx access log
- `CORS_ORIGIN`: Frontend URL for CORS

### Script Whitelist

Scripts must be added to `src/config/scripts.js` whitelist before they can be executed. This prevents arbitrary script execution.

## Running

### Development

```bash
npm run dev
```

### Production

```bash
npm start
```

Or use a process manager like PM2:

```bash
pm2 start src/index.js --name sentinel-backend
```

## API Endpoints

All endpoints require Bearer token authentication:

```
Authorization: Bearer <your-token>
```

### GET /health

Health check endpoint (no authentication required).

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T12:00:00Z",
  "uptime": 12345.67
}
```

### GET /api/overview

Returns summary statistics and timestamp.

**Response:**
```json
{
  "timestamp": "2024-01-01T12:00:00Z",
  "server": {
    "hostname": "server-name",
    "uptime": "5 days, 12:30"
  },
  "summary": {
    "active_jails": 5,
    "total_banned_ips": 42
  },
  "jails": [],
  "nginx": {
    "404_count": 150,
    "admin_scans": 23,
    "webdav_attacks": 5,
    "hidden_files_attempts": 12
  },
  "system": {
    "memory": "2.5G/8G (31%)",
    "disk": "45G/100G (45%)",
    "load": "0.5, 0.6, 0.7"
  }
}
```

### GET /api/jails

Returns dynamic list of all active jails.

**Response:**
```json
{
  "jails": [
    {
      "name": "sshd",
      "enabled": true,
      "bannedIPs": [
        {
          "ip": "1.2.3.4",
          "bannedAt": "2024-01-01T11:00:00Z",
          "banCount": 1
        }
      ],
      "category": "ssh",
      "filter": "sshd",
      "maxRetry": 3,
      "banTime": 3600
    }
  ],
  "lastUpdated": "2024-01-01T12:00:00Z",
  "serverStatus": "online"
}
```

### GET /api/jails/:name

Returns details for a single jail.

**Parameters:**
- `name`: Jail name (alphanumeric, dash, underscore, dot only)

**Response:**
```json
{
  "name": "sshd",
  "enabled": true,
  "bannedIPs": [...],
  "category": "ssh",
  "severity": "medium",
  "filter": "sshd",
  "maxRetry": 3,
  "banTime": 3600,
  "findTime": 600,
  "last_activity": "2024-01-01T11:00:00Z"
}
```

**Errors:**
- `404`: Jail not found
- `400`: Invalid jail name format

### GET /api/nginx

Returns aggregated nginx security statistics.

**Response:**
```json
{
  "404_count": 150,
  "admin_scans": 23,
  "webdav_attacks": 5,
  "hidden_files_attempts": 12
}
```

### GET /api/system

Returns system information (memory, disk, uptime).

**Response:**
```json
{
  "hostname": "server-name",
  "uptime": "5 days, 12:30",
  "memory": "2.5G/8G (31%)",
  "disk": "45G/100G (45%)",
  "load": "0.5, 0.6, 0.7"
}
```

### POST /api/backup

Triggers fail2ban configuration backup.

**Response:**
```json
{
  "success": true,
  "filename": "fail2ban-backup-20240101_123045.tar.gz",
  "path": "/tmp/fail2ban-backup-20240101_123045.tar.gz",
  "size": 1048576,
  "sizeFormatted": "1 MB",
  "timestamp": "2024-01-01T12:30:45Z"
}
```

## Data Model

### Jail Categories

Categories are automatically inferred from jail names:

- `sshd*` → `"ssh"`
- `nginx*` → `"nginx"`
- `apache*`, `http*` → `"http"`
- `postfix*`, `dovecot*`, `recidive*`, `pam-*` → `"system"`
- Unknown → `"other"`

### Severity Levels

Severity is inferred based on banned IP count and jail category:

- **High**: >= 20 banned IPs (SSH), >= 30 (nginx/http), >= 15 (system)
- **Medium**: >= 5 banned IPs (SSH), >= 10 (nginx/http), >= 3 (system)
- **Low**: < medium threshold

## Error Handling

The API uses graceful degradation:

- If fail2ban is unavailable, nginx/system data is still returned
- Clear JSON error responses with error codes
- 404 for missing resources, 500 for server errors
- Rate limiting prevents abuse

**Error Response Format:**
```json
{
  "error": "Error message",
  "code": "ERROR_CODE"
}
```

## Caching

Responses are cached in-memory with configurable TTL:

- Overview: 5 seconds (default)
- Jails: 5 seconds (default)
- Nginx: 10 seconds (default)
- System: 30 seconds (default)
- Backup: No caching (always executes)

Cache is automatically cleaned of expired entries.

## Scripts

### Available Scripts

**IMPORTANT**: The backend uses the actual server scripts located at `/opt/fail2ban-dashboard/scripts/`. These scripts are the **single source of truth** and are NOT modified by the backend.

1. **monitor-security.sh**: Main monitoring script - provides comprehensive security data (fail2ban, nginx, system)
2. **quick-check.sh**: Quick status check for fast overview
3. **test-fail2ban.sh**: Comprehensive fail2ban test and diagnostics
4. **backup-fail2ban.sh**: Backup fail2ban configuration to `/home/pepinko/fail2ban-backups/`
5. **test-filters.sh**: Test fail2ban filters against real log files

The backend **only executes** these scripts and **parses their output**. It does NOT duplicate their logic or modify them.

### Adding New Scripts

1. Add script to `/opt/fail2ban-dashboard/scripts/` (server scripts directory)
2. Make it executable: `chmod +x /opt/fail2ban-dashboard/scripts/your-script.sh`
3. Add to whitelist in `src/config/scripts.js`
4. Create parser in `src/services/parsers/` to handle the script's output format
5. Add route in `src/routes/` to expose the data via API
6. Update sudoers to allow execution of the script

**Important**: The backend only executes and parses scripts. It does NOT modify or duplicate their logic.

## Development

### Project Structure

```
backend/
├── src/
│   ├── index.js              # Express app entry point
│   ├── config/               # Configuration
│   ├── middleware/           # Auth, error handling
│   ├── routes/               # API routes
│   ├── services/             # Business logic
│   │   ├── scriptExecutor.js # Secure script execution
│   │   ├── cache.js          # Caching layer
│   │   └── parsers/          # Output parsers
│   └── utils/                # Utilities
├── scripts/                  # Whitelisted bash scripts
├── package.json
└── README.md
```

### Testing

Test endpoints with curl:

```bash
# Health check
curl http://localhost:3001/health

# API endpoint (with auth)
curl -H "Authorization: Bearer your-token" http://localhost:3001/api/jails
```

## Troubleshooting

### Script Execution Fails

- Check script permissions: `chmod +x /opt/fail2ban-dashboard/scripts/*.sh`
- Verify sudoers configuration allows script execution
- Check script paths in `src/config/scripts.js` and `src/config/config.js`
- Verify `SCRIPTS_DIR` environment variable points to correct directory

### Authentication Fails

- Verify `AUTH_TOKEN` in `.env` matches frontend
- Check token format: `Bearer <token>`

### Cache Issues

- Clear cache by restarting server
- Adjust TTL values in `.env`

### fail2ban Not Found

- Verify fail2ban is installed: `which fail2ban-client`
- Check sudoers allows fail2ban-client commands

## Security Best Practices

1. **Never run as root**: Backend should run as non-privileged user
2. **Minimal sudo permissions**: Only allow specific commands
3. **Strong authentication token**: Use cryptographically random token
4. **Rate limiting**: Prevents abuse and DoS
5. **Input validation**: All user input is validated
6. **No shell injection**: Scripts use `execFile`, not `exec`
7. **Whitelist only**: Only whitelisted scripts can execute

## License

MIT

