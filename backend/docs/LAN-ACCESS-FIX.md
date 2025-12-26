# LAN Access Fix Guide

## Problem
Backend is not accessible from other computers in local network (192.168.178.x).

## Solutions

### 1. Check Backend Binding
Backend should bind to `0.0.0.0` in development mode (already configured).

Verify in startup logs:
```
🚀 Sentinel Backend API running on 0.0.0.0:3010
```

### 2. Check Firewall
If using UFW (Ubuntu Firewall):

```bash
# Allow port 3010
sudo ufw allow 3010/tcp

# Check status
sudo ufw status
```

If using iptables:
```bash
sudo iptables -A INPUT -p tcp --dport 3010 -j ACCEPT
```

### 3. Check Network Interface
Verify server IP address:
```bash
ip addr show | grep "inet " | grep -v "127.0.0.1"
```

Should show: `192.168.178.48` or similar.

### 4. Test from Another Computer
From another PC in the same network:
```bash
# Test connectivity
ping 192.168.178.48

# Test backend
curl http://192.168.178.48:3010/health
```

### 5. Check SELinux (if enabled)
```bash
# Check status
getenforce

# If enforcing, allow port
sudo semanage port -a -t http_port_t -p tcp 3010
```

## Common Issues

### Backend shows "0.0.0.0:3010" but still not accessible
- **Firewall blocking**: Check UFW/iptables rules
- **Network interface down**: Check `ip link show`
- **Router blocking**: Check router firewall settings

### CORS errors from LAN
- Backend should allow all origins in development (already configured)
- Check browser console for exact CORS error
- Verify `NODE_ENV=development` in backend

### Connection timeout
- Check if port is actually listening: `netstat -tlnp | grep 3010`
- Verify firewall allows the port
- Check if another service is using port 3010

## Verification
After fixes, test from LAN computer:
1. Open browser: `http://192.168.178.48:3010/health`
2. Should return JSON response
3. No CORS errors in browser console

