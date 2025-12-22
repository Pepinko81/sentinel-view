# LAN Access Fix Guide

## Problem
Backend is not accessible from other computers in local network (192.168.178.x).

## Solutions

### 1. Check Backend Binding
Backend should bind to `0.0.0.0` in development mode (already configured).

Verify in startup logs:
```
🚀 Sentinel Backend API running on 0.0.0.0:3002
```

### 2. Check Firewall
If using UFW (Ubuntu Firewall):

```bash
# Allow port 3002
sudo ufw allow 3002/tcp

# Check status
sudo ufw status
```

If using iptables:
```bash
sudo iptables -A INPUT -p tcp --dport 3002 -j ACCEPT
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
curl http://192.168.178.48:3002/health
```

### 5. Check SELinux (if enabled)
```bash
# Check status
getenforce

# If enforcing, allow port
sudo semanage port -a -t http_port_t -p tcp 3002
```

## Common Issues

### Backend shows "0.0.0.0:3002" but still not accessible
- **Firewall blocking**: Check UFW/iptables rules
- **Network interface down**: Check `ip link show`
- **Router blocking**: Check router firewall settings

### CORS errors from LAN
- Backend should allow all origins in development (already configured)
- Check browser console for exact CORS error
- Verify `NODE_ENV=development` in backend

### Connection timeout
- Check if port is actually listening: `netstat -tlnp | grep 3002`
- Verify firewall allows the port
- Check if another service is using port 3002

## Verification
After fixes, test from LAN computer:
1. Open browser: `http://192.168.178.48:3002/health`
2. Should return JSON response
3. No CORS errors in browser console

