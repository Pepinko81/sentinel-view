# Environment Configuration Guide

## Overview

The backend uses environment variables for all configuration. No hardcoded paths or values are used. Configuration is loaded from:
1. `.env` (base configuration)
2. `.env.development` (development overrides)
3. `.env.production` (production overrides)

## Environment Files

### Development: `.env.development`

**Location**: `backend/.env.development`

**Purpose**: Local development configuration

**Required Variables**:
- `AUTH_TOKEN` - API authentication token
- `SCRIPTS_DIR` - Path to scripts directory

**Example**:
```env
AUTH_TOKEN=dev-token-change-me
SCRIPTS_DIR=/home/user/sentinel-view/opt/fail2ban-dashboard/scripts
FAIL2BAN_AVAILABLE=false
NODE_ENV=development
```

**Validation**: Warnings only (non-fatal)

### Production: `.env.production`

**Location**: `backend/.env.production`

**Purpose**: Production server configuration

**Required Variables**:
- `AUTH_TOKEN` - Secure production token (MUST be set)
- `SCRIPTS_DIR` - Production scripts directory (MUST exist)
- `FAIL2BAN_AVAILABLE` - Set to `true` if fail2ban is available

**Example**:
```env
AUTH_TOKEN=your-secure-production-token-here
SCRIPTS_DIR=/opt/fail2ban-dashboard/scripts
FAIL2BAN_AVAILABLE=true
NODE_ENV=production
CORS_ORIGIN=https://your-frontend-domain.com
```

**Validation**: Fails fast if required variables missing or invalid

## Required Variables

### AUTH_TOKEN

**Description**: Bearer token for API authentication

**Required**: Yes (always)

**Development**: Can use simple token for testing
**Production**: MUST be secure random token

**Generate**:
```bash
openssl rand -hex 32
```

**Example**:
```env
AUTH_TOKEN=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6
```

### SCRIPTS_DIR

**Description**: Absolute path to directory containing bash scripts

**Required**: Yes (always)

**Development**: Can point to local project directory
**Production**: Must point to production scripts directory

**Important**:
- Must be absolute path (no relative paths)
- Directory must exist and be readable
- Scripts must be executable
- Backend does NOT modify scripts (read-only)

**Example**:
```env
SCRIPTS_DIR=/opt/fail2ban-dashboard/scripts
```

**Validation**:
- Development: Warning if missing or invalid
- Production: Fails if missing or invalid

## Optional Variables

### FAIL2BAN_AVAILABLE

**Description**: Whether fail2ban is available on the system

**Default**: 
- Development: `false`
- Production: `true`

**Values**: `true` | `false`

**Purpose**: Allows backend to handle fail2ban unavailability gracefully

**Example**:
```env
FAIL2BAN_AVAILABLE=true
```

### NODE_ENV

**Description**: Node.js environment

**Default**: `development`

**Values**: `development` | `production`

**Effects**:
- Determines which `.env` file to load
- Affects validation strictness
- Enables/disables performance monitoring

**Example**:
```env
NODE_ENV=production
```

### PORT

**Description**: Server port

**Default**: `3002`

**Example**:
```env
PORT=3002
```

### CORS_ORIGIN

**Description**: Allowed CORS origin for frontend

**Default**: `http://localhost:5173`

**Production**: Must be set to frontend URL (no wildcards)

**Example**:
```env
CORS_ORIGIN=https://dashboard.example.com
```

### Cache Configuration

**Variables**:
- `CACHE_OVERVIEW_TTL` - Overview cache TTL (ms, default: 10000)
- `CACHE_JAILS_TTL` - Jails cache TTL (ms, default: 5000)
- `CACHE_NGINX_TTL` - Nginx cache TTL (ms, default: 10000)
- `CACHE_SYSTEM_TTL` - System cache TTL (ms, default: 30000)

**Example**:
```env
CACHE_OVERVIEW_TTL=10000
CACHE_JAILS_TTL=5000
```

### Performance Configuration

**Variables**:
- `PERFORMANCE_MONITORING` - Enable performance monitoring (default: true in dev, false in prod)
- `SLOW_REQUEST_THRESHOLD` - Slow request threshold (ms, default: 300)
- `OVERVIEW_MAX_RESPONSE_TIME` - Max response time for overview (ms, default: 250)

**Example**:
```env
PERFORMANCE_MONITORING=true
SLOW_REQUEST_THRESHOLD=300
```

### Rate Limiting

**Variables**:
- `RATE_LIMIT_WINDOW` - Rate limit window (ms, default: 60000)
- `RATE_LIMIT_MAX` - Max requests per window (default: 100)

**Example**:
```env
RATE_LIMIT_WINDOW=60000
RATE_LIMIT_MAX=100
```

## Configuration Validation

### Development Mode

**Behavior**: Warnings only (non-fatal)

**Warnings for**:
- Missing `SCRIPTS_DIR`
- Invalid `SCRIPTS_DIR` path
- Missing scripts
- fail2ban not available

**Backend**: Starts even with warnings

### Production Mode

**Behavior**: Fails fast on errors

**Fails for**:
- Missing `AUTH_TOKEN`
- Missing `SCRIPTS_DIR`
- Invalid `SCRIPTS_DIR` path
- `SCRIPTS_DIR` not readable
- Using default `AUTH_TOKEN`

**Backend**: Does NOT start if errors present

## Setup Instructions

### Development Setup

1. **Copy example file**:
   ```bash
   cd backend
   cp .env.development.example .env.development
   ```

2. **Edit configuration**:
   ```bash
   nano .env.development
   ```

3. **Set required variables**:
   ```env
   AUTH_TOKEN=dev-token-change-me
   SCRIPTS_DIR=/path/to/local/scripts
   FAIL2BAN_AVAILABLE=false
   ```

4. **Start backend**:
   ```bash
   npm run dev
   ```

### Production Setup

1. **Copy example file**:
   ```bash
   cd backend
   cp .env.production.example .env.production
   ```

2. **Edit configuration**:
   ```bash
   nano .env.production
   ```

3. **Set required variables**:
   ```env
   AUTH_TOKEN=$(openssl rand -hex 32)
   SCRIPTS_DIR=/opt/fail2ban-dashboard/scripts
   FAIL2BAN_AVAILABLE=true
   NODE_ENV=production
   CORS_ORIGIN=https://your-frontend-domain.com
   ```

4. **Verify configuration**:
   ```bash
   NODE_ENV=production node src/index.js
   # Should show: ✅ Configuration validated successfully
   ```

5. **Start backend**:
   ```bash
   npm start
   ```

## Environment File Priority

Configuration is loaded in this order (later overrides earlier):

1. System environment variables
2. `.env` (base)
3. `.env.development` (if `NODE_ENV=development`)
4. `.env.production` (if `NODE_ENV=production`)

## Security Notes

### Production

- ✅ `AUTH_TOKEN` MUST be secure random value
- ✅ `AUTH_TOKEN` MUST NOT be default value
- ✅ `SCRIPTS_DIR` MUST be absolute path
- ✅ `CORS_ORIGIN` MUST be specific URL (no wildcards)
- ✅ `.env.production` should have restricted permissions:
  ```bash
  chmod 600 .env.production
  ```

### Development

- ⚠️ Can use simple tokens for testing
- ⚠️ Warnings are non-fatal
- ⚠️ Can point to local scripts directory

## Troubleshooting

### "SCRIPTS_DIR path does not exist"

**Development**: Warning only - backend starts but scripts won't work
**Production**: Error - backend won't start

**Fix**:
1. Verify path exists: `ls -la /opt/fail2ban-dashboard/scripts`
2. Update `SCRIPTS_DIR` in `.env` file
3. Restart backend

### "fail2ban-client command not found"

**Development**: Warning only - backend works with partial data
**Production**: Warning - set `FAIL2BAN_AVAILABLE=false` if fail2ban not installed

**Fix**:
1. Install fail2ban: `sudo apt-get install fail2ban`
2. Or set `FAIL2BAN_AVAILABLE=false` in `.env`

### "AUTH_TOKEN must be set in production"

**Error**: Using default token in production

**Fix**:
1. Generate secure token: `openssl rand -hex 32`
2. Set in `.env.production`: `AUTH_TOKEN=generated-token`
3. Restart backend

## Best Practices

1. **Never commit `.env` files** - Add to `.gitignore`
2. **Use different tokens** - Dev and production should have different tokens
3. **Absolute paths only** - Never use relative paths for `SCRIPTS_DIR`
4. **Validate before deploy** - Test production config locally first
5. **Document custom paths** - If scripts are in non-standard location

## Example Configurations

### Minimal Development Config

```env
AUTH_TOKEN=dev-token
SCRIPTS_DIR=/home/user/sentinel-view/opt/fail2ban-dashboard/scripts
FAIL2BAN_AVAILABLE=false
```

### Full Production Config

```env
AUTH_TOKEN=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6
SCRIPTS_DIR=/opt/fail2ban-dashboard/scripts
FAIL2BAN_AVAILABLE=true
NODE_ENV=production
PORT=3002
CORS_ORIGIN=https://dashboard.example.com
CACHE_OVERVIEW_TTL=10000
PERFORMANCE_MONITORING=false
```

