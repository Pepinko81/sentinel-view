# LAN Access Setup Guide

## Problem
Frontend cannot connect to backend when accessing from another computer in the LAN network.

## Solution

### Step 1: Start Backend on Server

Make sure backend is running and listening on `0.0.0.0:3010`:

```bash
cd ~/sentinel-view/backend
npm run dev
# or in production:
NODE_ENV=production node src/index.js
```

**Verify backend is listening:**
```bash
# Should show: 0.0.0.0:3010 or :::3010
netstat -tlnp | grep 3010
# or
ss -tlnp | grep 3010
```

### Step 2: Configure Frontend for LAN Access

When accessing frontend from another computer, you need to set `VITE_API_URL` to the server's LAN IP address.

#### Option A: Environment Variable (Recommended)

Create `.env.local` in the project root:

```bash
cd ~/sentinel-view
nano .env.local
```

Add:
```env
# Replace 192.168.178.57 with your server's actual LAN IP
VITE_API_URL=http://192.168.178.57:3010
VITE_API_TOKEN=your-token-here
```

**Find your server's LAN IP:**
```bash
hostname -I | awk '{print $1}'
# or
ip addr show | grep "inet " | grep -v "127.0.0.1"
```

#### Option B: Build with LAN IP

If building for production, set the environment variable during build:

```bash
VITE_API_URL=http://192.168.178.57:3010 npm run build
```

### Step 3: Configure Firewall

Allow port 3010 through firewall:

**UFW (Ubuntu):**
```bash
sudo ufw allow 3010/tcp
sudo ufw status
```

**iptables:**
```bash
sudo iptables -A INPUT -p tcp --dport 3010 -j ACCEPT
```

### Step 4: Test Connection

From another computer in the same network:

```bash
# Test backend directly
curl http://192.168.178.57:3010/health

# Should return JSON response
```

### Step 5: Access Frontend

**If frontend is on the server:**
- Build frontend: `npm run build`
- Serve with nginx or another web server
- Access from LAN: `http://192.168.178.57:8080` (or your frontend port)

**If frontend is on your local machine:**
- Set `VITE_API_URL=http://192.168.178.57:3010` in `.env.local`
- Run `npm run dev`
- Access: `http://localhost:5173`

## Troubleshooting

### Backend not accessible
1. Check if backend is running: `ps aux | grep node`
2. Check if listening on 0.0.0.0: `netstat -tlnp | grep 3010`
3. Check firewall: `sudo ufw status`
4. Check backend logs for errors

### CORS errors
- Backend should allow all origins when `SERVER_HOST=0.0.0.0` (already configured)
- Check browser console for exact CORS error
- Verify backend CORS configuration

### Connection refused
- Backend not running: Start backend first
- Wrong IP address: Verify server IP with `hostname -I`
- Firewall blocking: Check firewall rules
- Port conflict: Check if another service uses port 3010

## Quick Reference

**Server IP:** `192.168.178.57` (replace with your actual IP)

**Backend URL:** `http://192.168.178.57:3010`

**Frontend .env.local:**
```env
VITE_API_URL=http://192.168.178.57:3010
VITE_API_TOKEN=your-token-here
```

