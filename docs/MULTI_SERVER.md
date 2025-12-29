# Multi-Server Support

Sentinel Dashboard now supports monitoring multiple fail2ban servers using an **Agent-PUSH architecture**.

## Architecture Overview

- **HQ Server**: The main Sentinel Dashboard backend (hosted locally)
- **Agents**: Lightweight collectors installed on remote servers
- **Communication**: Agents push data to HQ via HTTP POST every 30 seconds

## Agent Installation

### Step 1: Copy Agent Files

Copy the `/agent` folder to your remote server:

```bash
scp -r agent/ user@remote-server:/tmp/sentinel-agent
```

### Step 2: Configure Agent

Edit `config.json`:

```json
{
  "serverId": "unique-uuid-here",
  "secret": "your-secret-key-here",
  "hqUrl": "http://hq-server-ip:3010"
}
```

**Generate serverId:**
```bash
uuidgen  # Linux
# or use online UUID generator
```

**Generate secret:**
```bash
openssl rand -hex 32
```

### Step 3: Install Agent

Run the installation script as root:

```bash
cd /tmp/sentinel-agent
sudo ./install.sh
```

The script will:
- Copy agent files to `/opt/sentinel-agent`
- Install dependencies (jq, curl)
- Create systemd service and timer
- Start the agent timer (runs every 30 seconds)

### Step 4: Verify Installation

Check agent status:
```bash
systemctl status sentinel-agent.timer
systemctl status sentinel-agent.service
```

View agent logs:
```bash
journalctl -u sentinel-agent.service -f
```

Test agent manually:
```bash
/opt/sentinel-agent/agent.sh
```

## Agent Configuration

### Manual Configuration

Edit `/opt/sentinel-agent/config.json`:

```json
{
  "serverId": "550e8400-e29b-41d4-a716-446655440000",
  "secret": "your-32-character-secret-key",
  "hqUrl": "http://192.168.1.100:3010"
}
```

### Security Notes

- **Secret Key**: Must match between agent and HQ (stored in HQ database)
- **HQ URL**: Use IP address or hostname accessible from agent
- **Firewall**: Ensure agent can reach HQ on port 3010 (or configured port)

## HQ Server Setup

The HQ server automatically:
1. Registers new servers on first push (if secret matches)
2. Stores server data in SQLite database (`backend/data/servers.db`)
3. Tracks server status (online/offline based on lastSeen)

### Server Registration

Servers are auto-registered when they first push data with valid headers:
- `X-Sentinel-ID`: Server UUID
- `X-Sentinel-Key`: Secret key

If secret doesn't match existing server, a new server is created.

## API Endpoints

### Agent Endpoints

- `POST /api/agent/push` - Receive data from agent
  - Headers: `X-Sentinel-ID`, `X-Sentinel-Key`
  - Body: `{ serverId, timestamp, jails, bans, logTail }`

### Server Management

- `GET /api/servers` - List all servers
- `GET /api/servers/:id` - Get server details
- `POST /api/servers/:id/unban` - Unban IP on server
- `POST /api/servers/:id/action` - Execute action (start/stop/restart jail)

### Filtered Endpoints

Existing endpoints support `?server=id` parameter:
- `GET /api/jails?server=id` - Get jails for specific server
- `GET /api/bans?server=id` - Get bans for specific server

## Frontend Usage

### Servers Page

Navigate to `/servers` to see:
- List of all connected servers
- Server status (online/offline)
- Last seen timestamp
- Active ban count
- Click to view details

### Server Detail Page

View individual server:
- Jails table with status
- Active bans list
- Recent log tail
- Actions: start/stop/restart jails, unban IPs

## Troubleshooting

### Agent Not Connecting

1. **Check network connectivity:**
   ```bash
   curl -v http://hq-server-ip:3010/health
   ```

2. **Check agent logs:**
   ```bash
   journalctl -u sentinel-agent.service -n 50
   ```

3. **Test agent manually:**
   ```bash
   /opt/sentinel-agent/agent.sh
   ```

4. **Verify config:**
   ```bash
   cat /opt/sentinel-agent/config.json
   ```

### Server Not Appearing in HQ

1. Check HQ logs for agent push requests
2. Verify secret key matches
3. Check HQ database: `backend/data/servers.db`
4. Ensure HQ backend is running and accessible

### Agent Script Errors

Common issues:
- `jq not found`: Install jq: `apt-get install jq` or `yum install jq`
- `fail2ban-client not found`: Install fail2ban
- `curl not found`: Install curl
- Permission errors: Ensure agent.sh is executable (`chmod +x`)

## Database Schema

### servers table
- `id` (TEXT PRIMARY KEY) - Server UUID
- `name` (TEXT) - Server name
- `ip` (TEXT) - Server IP address
- `lastSeen` (INTEGER) - Last push timestamp
- `createdAt` (INTEGER) - Registration timestamp
- `secret` (TEXT) - Secret key

### server_data table
- `serverId` (TEXT) - Foreign key to servers
- `timestamp` (INTEGER) - Data timestamp
- `jails` (TEXT) - JSON array of jails
- `bans` (TEXT) - JSON array of bans
- `logTail` (TEXT) - JSON array of log lines

## Remote Actions

The agent includes a built-in HTTP server (`agent-server.js`) that listens for action commands from HQ.

### Supported Actions

- `unban(ip, jail)` - Unban IP from jail
- `start(jail)` - Start a jail
- `stop(jail)` - Stop a jail
- `restart_fail2ban` - Restart fail2ban service

### Security

All remote actions are authenticated using HMAC SHA256 signatures:
- HQ generates signature using shared secret
- Agent verifies signature before executing
- Invalid signatures are rejected

### Agent Server Configuration

The agent server runs on port 4040 by default (configurable in `config.json`):

```json
{
  "port": 4040,
  "host": "0.0.0.0"
}
```

The firewall port is automatically opened during installation (if ufw is installed).

## Limitations (MVP)

- **No WebSocket**: Log streaming only available for local server
- **No SSL**: HTTP only (no TLS/HTTPS)
- **No Billing**: Free, no usage limits

## Future Enhancements

- Agent action endpoint (for remote unban/restart)
- WebSocket support for remote log streaming
- SSL/TLS support
- Server grouping and tags
- Alerting and notifications
- Historical data retention policies

