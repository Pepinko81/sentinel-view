# Remote Actions Testing Guide

## Prerequisites

1. **HQ Server**: Running Sentinel backend on port 3010
2. **Remote Server**: Agent installed and running
3. **Network**: HQ can reach remote server on agent port (default 4040)

## Agent Setup

### 1. Install Agent

```bash
cd agent
# Edit config.json with serverId, secret, hqUrl, listenPort
sudo ./install.sh
```

### 2. Verify Agent Server Running

```bash
# Check service status
sudo systemctl status sentinel-agent-server.service

# Check if listening on port
sudo netstat -tlnp | grep 4040
# or
sudo ss -tlnp | grep 4040

# Test health endpoint
curl http://localhost:4040/health
```

Expected response:
```json
{"ok":true,"status":"healthy","timestamp":1234567890}
```

## Testing Remote Actions

### Test 1: Restart Fail2ban

**From HQ server:**
```bash
# Get server secret from database (or use known secret)
SECRET="your-secret-key"

# Generate signature
PAYLOAD='{"action":"restart_fail2ban","params":{}}'
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" | cut -d' ' -f2)

# Send request
curl -X POST http://REMOTE_IP:4040/api/action \
  -H "Content-Type: application/json" \
  -H "x-signature: $SIGNATURE" \
  -d "$PAYLOAD"
```

Expected response:
```json
{"ok":true,"result":"","executedAt":1234567890,"serverId":"server-uuid"}
```

### Test 2: Unban IP

```bash
PAYLOAD='{"action":"unban","params":{"jail":"nginx-hidden-files","ip":"192.168.1.100"}}'
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" | cut -d' ' -f2)

curl -X POST http://REMOTE_IP:4040/api/action \
  -H "Content-Type: application/json" \
  -H "x-signature: $SIGNATURE" \
  -d "$PAYLOAD"
```

### Test 3: Start Jail

```bash
PAYLOAD='{"action":"start","params":{"jail":"nginx-hidden-files"}}'
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" | cut -d' ' -f2)

curl -X POST http://REMOTE_IP:4040/api/action \
  -H "Content-Type: application/json" \
  -H "x-signature: $SIGNATURE" \
  -d "$PAYLOAD"
```

### Test 4: Stop Jail

```bash
PAYLOAD='{"action":"stop","params":{"jail":"nginx-hidden-files"}}'
SIGNATURE=$(echo -n "$PAYLOAD" | openssl dgst -sha256 -hmac "$SECRET" | cut -d' ' -f2)

curl -X POST http://REMOTE_IP:4040/api/action \
  -H "Content-Type: application/json" \
  -H "x-signature: $SIGNATURE" \
  -d "$PAYLOAD"
```

## Testing from Dashboard UI

### 1. Verify Server Online

1. Navigate to `/servers` in dashboard
2. Verify remote server shows as "Online" (green indicator)
3. Check "Last Seen" is recent (< 60 seconds)

### 2. Test Unban

1. Click on remote server to view details
2. Go to "Active Bans" section
3. Click "Unban" on any banned IP
4. Verify toast notification shows success
5. Check remote server logs: `journalctl -u sentinel-agent-server.service -f`

### 3. Test Jail Actions

1. In server detail page, go to "Jails" section
2. Click "Start" or "Stop" on a jail
3. Verify toast notification
4. Check remote server to confirm jail status changed

### 4. Test Restart Fail2ban

1. In server detail page
2. Use restart action (if available in UI)
3. Verify fail2ban restarted on remote server

## Troubleshooting

### Agent Server Not Responding

**Check service:**
```bash
sudo systemctl status sentinel-agent-server.service
sudo journalctl -u sentinel-agent-server.service -n 50
```

**Check port:**
```bash
sudo lsof -i :4040
```

**Check firewall:**
```bash
sudo ufw status
sudo ufw allow 4040/tcp
```

### Invalid Signature Error

**Verify secret matches:**
- Check `config.json` on remote server
- Check database on HQ server
- Secret must be identical

**Test signature generation:**
```bash
# On HQ (Node.js)
node -e "const crypto=require('crypto');const h=crypto.createHmac('sha256','SECRET');h.update(JSON.stringify({action:'restart_fail2ban',params:{}}));console.log(h.digest('hex'));"
```

### Connection Refused

**Check network:**
```bash
# From HQ, test connectivity
telnet REMOTE_IP 4040
# or
nc -zv REMOTE_IP 4040
```

**Check agent server is listening on correct interface:**
- Default: `0.0.0.0:4040` (all interfaces)
- Verify in `config.json`: `listenPort`

### Action Executes But Fails

**Check sudo permissions:**
```bash
# Test manually on remote server
sudo fail2ban-client status
sudo systemctl restart fail2ban
```

**Check agent logs:**
```bash
sudo journalctl -u sentinel-agent-server.service -f
```

## Success Criteria Checklist

- [ ] Agent server starts and listens on port 4040
- [ ] Health endpoint responds correctly
- [ ] Signature validation works (rejects invalid signatures)
- [ ] Restart fail2ban executes remotely
- [ ] Unban IP executes remotely
- [ ] Start/stop jail executes remotely
- [ ] Dashboard shows server as online
- [ ] Action buttons work from UI
- [ ] Toast notifications show success/failure
- [ ] Buttons disabled when server offline
- [ ] HQ never executes fail2ban commands for remote servers

