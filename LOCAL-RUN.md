# Local Development Run Guide

Complete step-by-step guide for running the Sentinel Security Monitoring Dashboard locally with real backend integration.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Backend Setup](#backend-setup)
3. [Frontend Setup](#frontend-setup)
4. [First Integration Test](#first-integration-test)
5. [End-to-End Test](#end-to-end-test)
6. [Troubleshooting](#troubleshooting)
7. [Success Checklist](#success-checklist)

---

## Prerequisites

### Required Software

- **Node.js**: >= 18.0.0
  ```bash
  node --version  # Should show v18.x.x or higher
  ```

- **npm**: Comes with Node.js
  ```bash
  npm --version
  ```

- **fail2ban**: Service must be running
  ```bash
  sudo systemctl status fail2ban
  # Should show "active (running)"
  ```

- **sudoers configured**: Backend user must have sudo permissions
  - See `backend/docs/SUDOERS-HARDENING.md` for configuration
  - User should be able to run scripts without password prompt

### System Requirements

- Linux server with fail2ban installed
- Scripts directory: `/opt/fail2ban-dashboard/scripts`
- Backend user with limited sudo permissions
- Ports available: `3010` (backend), `5173` (frontend)

---

## Backend Setup

### Step 1: Navigate to Backend Directory

```bash
cd /home/pepinko/sentinel-view/backend
```

### Step 2: Install Dependencies

```bash
npm install
```

Expected output: Dependencies installed without errors.

### Step 3: Create Environment File

Create `.env` file in the `backend` directory:

```bash
cd backend
cp .env.example .env  # If .env.example exists
# OR create new .env file
nano .env
```

**Required environment variables:**

```env
# Authentication Token (REQUIRED)
# Generate a secure random token:
# C
AUTH_TOKEN=your-secure-random-token-here

# Scripts Directory (REQUIRED)
SCRIPTS_DIR=/opt/fail2ban-dashboard/scripts

# Server Configuration
PORT=3010
NODE_ENV=development

# CORS Configuration
CORS_ORIGIN=http://localhost:5173

# Cache Configuration (optional)
CACHE_OVERVIEW_TTL=10000
CACHE_JAILS_TTL=5000

# Rate Limiting (optional)
RATE_LIMIT_WINDOW=60000
RATE_LIMIT_MAX=100
```

**Generate secure token:**
```bash
openssl rand -hex 32
# Copy the output to AUTH_TOKEN in .env
```

### Step 4: Verify Scripts Directory

```bash
ls -la /opt/fail2ban-dashboard/scripts/
```

Expected files:
- `monitor-security.sh`
- `quick-check.sh`
- `backup-fail2ban.sh`
- `test-fail2ban.sh`
- `test-filters.sh`

### Step 5: Verify Sudoers Configuration

Test if backend user can run scripts without password:

```bash
# Test as the backend user (usually sentinel_user)
sudo /opt/fail2ban-dashboard/scripts/quick-check.sh
```

If prompted for password, configure sudoers (see `backend/docs/SUDOERS-HARDENING.md`).

### Step 6: Start Backend Server

```bash
npm run dev
```

Expected output:
```
✅ Configuration validated successfully
🚀 Sentinel Backend API running on port 3010
📊 Environment: development
🔒 Authentication: Enabled
📁 Scripts directory: /opt/fail2ban-dashboard/scripts
🌐 CORS Origin: http://localhost:5173
⚡ Performance monitoring: Enabled

📝 API Endpoints:
   GET  /health (enhanced health check)
   GET  /api/overview (optimized for <300ms)
   GET  /api/jails
   GET  /api/jails/:name
   GET  /api/nginx
   GET  /api/system
   POST /api/backup
```

### Step 7: Verify Backend is Running

Open a new terminal and test the health endpoint:

```bash
curl http://localhost:3010/health
```

**Expected response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "uptime": 10,
  "version": "2.0.0",
  "dependencies": {
    "fail2ban": "available",
    "scripts": "accessible",
    "cache": "operational"
  },
  "responseTime": 15
}
```

**Response time should be <50ms.**

If you see errors:
- Check fail2ban service: `sudo systemctl status fail2ban`
- Check scripts directory permissions
- Check backend logs for detailed error messages

---

## Frontend Setup

### Step 1: Navigate to Project Root

```bash
cd /home/pepinko/sentinel-view
```

### Step 2: Install Dependencies

```bash
npm install
```

Expected output: Dependencies installed without errors.

### Step 3: Create Environment File

Create `.env.local` file in the project root:

```bash
cp .env.local.example .env.local
nano .env.local
```

**Required environment variables:**

```env
# Backend API URL
VITE_API_URL=http://localhost:3010

# Backend API Token (MUST match backend AUTH_TOKEN)
VITE_API_TOKEN=your-secure-random-token-here
```

**Important:** `VITE_API_TOKEN` must match `AUTH_TOKEN` from backend `.env` file.

### Step 4: Start Frontend Development Server

```bash
npm run dev
```

Expected output:
```
  VITE v5.x.x  ready in xxx ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
  ➜  press h + enter to show help
```

### Step 5: Verify Frontend is Running

Open browser: `http://localhost:5173`

You should see:
- Loading skeletons initially
- Then real data from backend (or error if backend not running)

---

## First Integration Test

### Test 1: Health Endpoint

```bash
curl http://localhost:3010/health
```

**Success criteria:**
- Status code: 200
- Response time: <50ms
- JSON response with `status: "ok"`

### Test 2: Overview Endpoint (with Authentication)

```bash
# Replace YOUR_TOKEN with actual token from .env
curl -H "Authorization: Bearer YOUR_TOKEN" \
     http://localhost:3010/api/overview
```

**Expected response structure:**
```json
{
  "timestamp": "2024-01-01T12:00:00.000Z",
  "server": {
    "hostname": "server-name",
    "uptime": "5 days, 12:30:45"
  },
  "summary": {
    "active_jails": 5,
    "total_banned_ips": 42
  },
  "jails": [
    {
      "name": "sshd",
      "enabled": true,
      "bannedIPs": [...],
      "category": "SSH",
      "filter": "sshd",
      "maxRetry": null,
      "banTime": null
    }
  ],
  "nginx": {
    "404_count": 150,
    "admin_scans": 23,
    "webdav_attacks": 5,
    "hidden_files_attempts": 12
  },
  "system": {
    "memory": "2.5G/8G",
    "disk": "45G/100G (45%)",
    "load": "0.5, 0.6, 0.7"
  }
}
```

**Success criteria:**
- Status code: 200
- Response time: <300ms (cached) or <300ms (uncached)
- Valid JSON structure
- No parser errors in backend logs

### Test 3: Jails Endpoint

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
     http://localhost:3010/api/jails
```

**Expected response:**
```json
{
  "jails": [...],
  "lastUpdated": "2024-01-01T12:00:00.000Z",
  "serverStatus": "online"
}
```

### Test 4: Test Without Authentication (Should Fail)

```bash
curl http://localhost:3010/api/overview
```

**Expected response:**
```json
{
  "error": "Authentication required",
  "code": "AUTH_REQUIRED"
}
```

Status code: 401

---

## End-to-End Test

### Step 1: Start Both Servers

**Terminal 1 - Backend:**
```bash
cd backend
npm run dev
```

**Terminal 2 - Frontend:**
```bash
npm run dev
```

### Step 2: Open Browser

Navigate to: `http://localhost:5173`

### Step 3: Check Browser Console

Open Developer Tools (F12) → Console tab

**Expected:**
- No red errors
- API calls visible in Network tab
- Responses with status 200

**If errors appear:**
- Check CORS errors → Verify `CORS_ORIGIN` in backend `.env`
- Check 401 errors → Verify `VITE_API_TOKEN` matches backend `AUTH_TOKEN`
- Check network errors → Verify backend is running on port 3010

### Step 4: Verify Dashboard

**Dashboard page should show:**
- ✅ Real server hostname
- ✅ Real jail count (not mock data)
- ✅ Real banned IP count
- ✅ Server status indicator (green if online)
- ✅ Categories from real jails
- ✅ No mock/demo data visible

**Jails page should show:**
- ✅ Real jail names (from your fail2ban configuration)
- ✅ Real banned IPs (if any)
- ✅ Real categories
- ✅ Filtering and search working
- ✅ No hardcoded jail names

### Step 5: Test Error Handling

**Stop backend server** (Ctrl+C in backend terminal)

**Frontend should:**
- ✅ Show error message
- ✅ Display "Server Status: OFFLINE" (red)
- ✅ Show retry button
- ✅ Not crash or show blank screen

**Restart backend** and click retry button

**Frontend should:**
- ✅ Reconnect successfully
- ✅ Load data again
- ✅ Show "Server Status: ONLINE" (green)

---

## Troubleshooting

### Problem: Backend running but frontend shows empty data

**Possible causes:**
1. **CORS misconfiguration**
   - Check `CORS_ORIGIN` in backend `.env` matches frontend URL
   - Should be: `CORS_ORIGIN=http://localhost:5173`

2. **API token mismatch**
   - Verify `VITE_API_TOKEN` in frontend `.env.local` matches `AUTH_TOKEN` in backend `.env`
   - Regenerate token if needed: `openssl rand -hex 32`

3. **API URL incorrect**
   - Verify `VITE_API_URL=http://localhost:3010` in frontend `.env.local`
   - Check backend is actually running on port 3010

**Solution:**
```bash
# Check backend logs for CORS errors
# Check browser console for network errors
# Verify environment variables match
```

### Problem: 401 Unauthorized

**Cause:** Authentication token mismatch or missing

**Solution:**
1. Verify `VITE_API_TOKEN` in frontend `.env.local`
2. Verify `AUTH_TOKEN` in backend `.env`
3. Ensure tokens match exactly
4. Restart both servers after changing tokens

### Problem: sudo permission errors

**Error message:** `sudo: a password is required`

**Solution:**
1. Check sudoers configuration:
   ```bash
   sudo visudo -f /etc/sudoers.d/sentinel-backend
   ```

2. Verify user can run scripts:
   ```bash
   sudo /opt/fail2ban-dashboard/scripts/quick-check.sh
   ```

3. See `backend/docs/SUDOERS-HARDENING.md` for proper configuration

### Problem: Parser returning empty data

**Symptoms:**
- Backend responds with 200
- But jails array is empty
- No banned IPs shown

**Possible causes:**
1. **fail2ban service not running**
   ```bash
   sudo systemctl status fail2ban
   sudo systemctl start fail2ban  # If stopped
   ```

2. **No jails configured**
   ```bash
   sudo fail2ban-client status
   # Should show list of jails
   ```

3. **Scripts not executable**
   ```bash
   ls -la /opt/fail2ban-dashboard/scripts/
   # Should show -rwxr-xr-x (executable)
   chmod +x /opt/fail2ban-dashboard/scripts/*.sh  # If needed
   ```

4. **Scripts returning errors**
   - Check backend logs for parser warnings
   - Manually test script: `sudo /opt/fail2ban-dashboard/scripts/monitor-security.sh`

### Problem: fail2ban not running

**Check status:**
```bash
sudo systemctl status fail2ban
```

**Start service:**
```bash
sudo systemctl start fail2ban
```

**Enable on boot:**
```bash
sudo systemctl enable fail2ban
```

**Check logs:**
```bash
sudo journalctl -u fail2ban -n 50
```

### Problem: CORS errors in browser

**Error:** `Access to fetch at 'http://localhost:3010/api/...' from origin 'http://localhost:5173' has been blocked by CORS policy`

**Solution:**
1. Verify `CORS_ORIGIN=http://localhost:5173` in backend `.env`
2. Restart backend server
3. Clear browser cache
4. Check backend logs for CORS rejection messages

### Problem: Network errors

**Error:** `Network error. Please check if the backend is running and accessible.`

**Solution:**
1. Verify backend is running: `curl http://localhost:3010/health`
2. Check port is not in use: `lsof -i :3010`
3. Verify firewall allows localhost connections
4. Check `VITE_API_URL` in frontend `.env.local`

### Problem: Response time >300ms

**Symptoms:**
- API calls are slow
- Backend logs show warnings about response time

**Possible causes:**
1. **Script execution slow**
   - fail2ban service slow to respond
   - Large number of jails/IPs
   - System under load

2. **Cache not working**
   - Check cache TTL settings
   - Verify cache is being used (check backend logs)

**Solution:**
- This is expected for first request (cache warming)
- Subsequent requests should be <10ms (cached)
- If consistently slow, check fail2ban service performance

### Problem: Frontend shows "Failed to load data"

**Check:**
1. Backend is running
2. Token is correct
3. CORS is configured
4. Network tab shows actual error

**Common fixes:**
- Restart both servers
- Clear browser cache
- Check browser console for detailed error
- Verify environment variables

---

## Success Checklist

### Backend Success Criteria

- [ ] Backend starts without sudo password prompt
- [ ] Health endpoint responds <50ms
- [ ] Overview endpoint responds <300ms
- [ ] All endpoints return valid JSON
- [ ] No parser errors in logs
- [ ] Authentication works (401 without token, 200 with token)
- [ ] CORS allows frontend origin

### Frontend Success Criteria

- [ ] Loads without console errors
- [ ] Displays real data from backend
- [ ] No mock data visible
- [ ] Loading states work correctly
- [ ] Error states handle gracefully
- [ ] Empty states display properly
- [ ] Server status indicator works (green/red)
- [ ] Retry button works on errors

### Integration Success Criteria

- [ ] Frontend connects to backend
- [ ] Authentication works (Bearer token)
- [ ] CORS configured correctly
- [ ] Data refreshes automatically (30s interval)
- [ ] API responses match frontend types
- [ ] No CORS errors in browser console
- [ ] No 401/403 errors
- [ ] Real jail names appear (not hardcoded)
- [ ] Real banned IPs appear (if any)

---

## Common Commands Reference

### Backend

```bash
# Start backend
cd backend && npm run dev

# Check health
curl http://localhost:3010/health

# Test API with auth
curl -H "Authorization: Bearer YOUR_TOKEN" http://localhost:3010/api/overview

# Check fail2ban status
sudo fail2ban-client status

# View backend logs
# (logs appear in terminal where backend is running)
```

### Frontend

```bash
# Start frontend
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

### System

```bash
# Check fail2ban service
sudo systemctl status fail2ban
sudo systemctl start fail2ban
sudo systemctl restart fail2ban

# Check scripts directory
ls -la /opt/fail2ban-dashboard/scripts/

# Test script manually
sudo /opt/fail2ban-dashboard/scripts/monitor-security.sh

# Check ports in use
lsof -i :3010  # Backend
lsof -i :5173  # Frontend
```

---

## Known Limitations (First Run)

1. **Unban/Toggle mutations**: These endpoints may not be implemented in backend yet. The frontend will show error messages if you try to use them.

2. **Partial data**: If fail2ban service is down, backend returns partial data (nginx/system info still available). Frontend handles this gracefully.

3. **First load slower**: First API call may be slower due to cache warming. Subsequent calls should be fast (<10ms cached).

4. **Empty jails**: Some jails may have no banned IPs - this is normal and expected.

5. **No real-time updates**: Data refreshes every 30 seconds. Manual refresh button available.

---

## Next Steps

After successful local run:

1. ✅ Verify all endpoints work
2. ✅ Test error scenarios
3. ✅ Verify no mock data
4. ✅ Check performance (<300ms)
5. ✅ Document any issues
6. ✅ Ready for production deployment

---

## Getting Help

If you encounter issues not covered here:

1. Check backend logs (terminal where backend is running)
2. Check browser console (F12 → Console)
3. Check browser Network tab (F12 → Network)
4. Verify all environment variables
5. Review `backend/docs/` for additional documentation
6. Check GitHub issues (if applicable)

---

**Last Updated:** 2024-12-26  
**Version:** 2.0.0

