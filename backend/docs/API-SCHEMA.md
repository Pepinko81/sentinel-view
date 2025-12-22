# API Schema Documentation

**Version**: 1.0.0  
**Last Updated**: 2024-01-01  
**Base URL**: `/api`

## Overview

This document defines the complete API schema for the Fail2ban Security Monitoring Dashboard backend. All responses are normalized to match the frontend TypeScript interfaces exactly.

## Versioning

- **Current Version**: `1.0.0`
- **Version Header**: `X-API-Version: 1.0.0`
- **Backward Compatibility**: Maintained for at least 2 major versions
- **Breaking Changes**: Will increment major version (e.g., `2.0.0`)

## Response Headers

All responses include:
- `Content-Type: application/json`
- `X-API-Version: 1.0.0`

## Common Patterns

### Backend-Only Fields

Fields prefixed with `_` (e.g., `_errors`, `_partial`) are backend-only and can be safely ignored by the frontend. They provide debugging information but do not affect frontend functionality.

### Optional Fields

Optional fields are **always present** in responses, using `null` if the value is not available. This ensures consistent schema structure.

### Type Safety

All fields are type-coerced to match the frontend schema:
- Strings: Always strings (never `undefined`)
- Numbers: Always numbers (default to `0`)
- Booleans: Always booleans (default to `false`)
- Arrays: Always arrays (default to `[]`)

## Core Data Types

### BannedIP

```typescript
interface BannedIP {
  ip: string;           // IP address (e.g., "192.168.1.1")
  bannedAt: string;      // ISO-8601 timestamp
  banCount: number;      // Number of times banned (default: 1)
}
```

**Example**:
```json
{
  "ip": "192.168.1.100",
  "bannedAt": "2024-01-01T12:00:00.000Z",
  "banCount": 1
}
```

### Jail

```typescript
interface Jail {
  name: string;                    // Jail name (required)
  enabled: boolean;                // Whether jail has banned IPs (required)
  bannedIPs: BannedIP[];          // Array of banned IPs (required, never null)
  category?: string | null;        // Category (optional, always present)
  filter?: string | null;         // Filter name (optional, always present)
  maxRetry?: number | null;       // Max retry count (optional, always present)
  banTime?: number | null;        // Ban duration in seconds (optional, always present)
}
```

**Example**:
```json
{
  "name": "sshd",
  "enabled": true,
  "bannedIPs": [
    {
      "ip": "192.168.1.100",
      "bannedAt": "2024-01-01T12:00:00.000Z",
      "banCount": 1
    }
  ],
  "category": "SSH",
  "filter": "sshd",
  "maxRetry": null,
  "banTime": null
}
```

## Endpoints

### GET /api/overview

Returns comprehensive security overview including jails, nginx stats, and system information.

**Response Schema**:
```typescript
{
  timestamp: string;              // ISO-8601 timestamp
  server: {
    hostname: string;
    uptime: string;
  };
  summary: {
    active_jails: number;
    total_banned_ips: number;
  };
  jails: Jail[];
  nginx: {
    404_count: number;
    admin_scans: number;
    webdav_attacks: number;
    hidden_files_attempts: number;
  };
  system: {
    memory: string;               // e.g., "2.5G/8G"
    disk: string;                 // e.g., "45G/100G (45%)"
    load: string;                  // e.g., "0.5, 0.6, 0.7"
  };
  // Backend-only fields (prefixed with _)
  _errors?: string[];
  _partial?: boolean;
  _serverStatus?: string;
}
```

**Example Response**:
```json
{
  "timestamp": "2024-01-01T12:00:00.000Z",
  "server": {
    "hostname": "server.example.com",
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
      "bannedIPs": [
        {
          "ip": "192.168.1.100",
          "bannedAt": "2024-01-01T12:00:00.000Z",
          "banCount": 1
        }
      ],
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
  },
  "_errors": [],
  "_partial": false
}
```

**Error Response** (fail2ban down):
```json
{
  "timestamp": "2024-01-01T12:00:00.000Z",
  "server": {
    "hostname": "server.example.com",
    "uptime": "5 days, 12:30:45"
  },
  "summary": {
    "active_jails": 0,
    "total_banned_ips": 0
  },
  "jails": [],
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
  },
  "_errors": ["fail2ban service unavailable - nginx and system data available"],
  "_partial": true,
  "_serverStatus": "partial"
}
```

### GET /api/jails

Returns list of all configured jails.

**Response Schema**:
```typescript
{
  jails: Jail[];
  lastUpdated: string;            // ISO-8601 timestamp
  serverStatus: 'online' | 'offline';
  // Backend-only fields
  _errors?: string[];
  _partial?: boolean;
}
```

**Example Response**:
```json
{
  "jails": [
    {
      "name": "sshd",
      "enabled": true,
      "bannedIPs": [
        {
          "ip": "192.168.1.100",
          "bannedAt": "2024-01-01T12:00:00.000Z",
          "banCount": 1
        }
      ],
      "category": "SSH",
      "filter": "sshd",
      "maxRetry": null,
      "banTime": null
    },
    {
      "name": "nginx-http-auth",
      "enabled": false,
      "bannedIPs": [],
      "category": "Web",
      "filter": "nginx-http-auth",
      "maxRetry": null,
      "banTime": null
    }
  ],
  "lastUpdated": "2024-01-01T12:00:00.000Z",
  "serverStatus": "online"
}
```

**Error Response** (fail2ban down):
```json
{
  "jails": [],
  "lastUpdated": "2024-01-01T12:00:00.000Z",
  "serverStatus": "offline",
  "_errors": ["fail2ban service unavailable"],
  "_partial": true
}
```

### GET /api/jails/:name

Returns details for a single jail.

**Path Parameters**:
- `name` (string, required): Jail name (must match pattern: `^[a-zA-Z0-9._-]+$`)

**Response Schema**:
```typescript
Jail & {
  // Additional backend-only fields
  _severity?: string;
  _findTime?: string | null;
  _lastActivity?: string | null;
  _errors?: string[];
  _partial?: boolean;
}
```

**Example Response**:
```json
{
  "name": "sshd",
  "enabled": true,
  "bannedIPs": [
    {
      "ip": "192.168.1.100",
      "bannedAt": "2024-01-01T12:00:00.000Z",
      "banCount": 1
    }
  ],
  "category": "SSH",
  "filter": "sshd",
  "maxRetry": null,
  "banTime": null,
  "_severity": "high",
  "_lastActivity": "2024-01-01T12:00:00.000Z"
}
```

**Error Responses**:

404 - Jail not found:
```json
{
  "error": "Jail \"invalid-jail\" not found",
  "code": "JAIL_NOT_FOUND",
  "errors": []
}
```

400 - Invalid jail name:
```json
{
  "error": "Invalid jail name",
  "code": "INVALID_JAIL_NAME"
}
```

503 - fail2ban unavailable:
```json
{
  "name": "sshd",
  "enabled": false,
  "bannedIPs": [],
  "category": "SSH",
  "filter": "sshd",
  "maxRetry": null,
  "banTime": null,
  "_errors": ["fail2ban service unavailable"],
  "_partial": true
}
```

### GET /api/nginx

Returns Nginx security statistics.

**Response Schema**:
```typescript
{
  404_count: number;
  admin_scans: number;
  webdav_attacks: number;
  hidden_files_attempts: number;
  // Backend-only fields
  _errors?: string[];
  _partial?: boolean;
}
```

**Example Response**:
```json
{
  "404_count": 150,
  "admin_scans": 23,
  "webdav_attacks": 5,
  "hidden_files_attempts": 12
}
```

**Error Response** (partial data):
```json
{
  "404_count": 150,
  "admin_scans": 23,
  "webdav_attacks": 5,
  "hidden_files_attempts": 12,
  "_errors": ["fail2ban unavailable (nginx data still available): Connection refused"],
  "_partial": true
}
```

### GET /api/system

Returns system information (memory, disk, uptime).

**Response Schema**:
```typescript
{
  hostname: string;
  uptime: string;                 // e.g., "5 days, 12:30:45"
  memory: string;                  // e.g., "2.5G/8G"
  disk: string;                    // e.g., "45G/100G (45%)"
  load: string;                    // e.g., "0.5, 0.6, 0.7"
  // Backend-only fields
  _errors?: string[];
  _partial?: boolean;
}
```

**Example Response**:
```json
{
  "hostname": "server.example.com",
  "uptime": "5 days, 12:30:45",
  "memory": "2.5G/8G",
  "disk": "45G/100G (45%)",
  "load": "0.5, 0.6, 0.7"
}
```

### POST /api/backup

Triggers a fail2ban configuration backup.

**Response Schema**:
```typescript
{
  success: boolean;
  filename: string;
  path: string;
  size: number;                    // Size in bytes
  sizeFormatted: string;           // Human-readable size (e.g., "1.5 MB")
  timestamp: string;               // ISO-8601 timestamp
  // Backend-only fields
  _errors?: string[];
  _partial?: boolean;
}
```

**Example Response**:
```json
{
  "success": true,
  "filename": "fail2ban-config-20240101_120000.tar.gz",
  "path": "/home/pepinko/fail2ban-backups/fail2ban-config-20240101_120000.tar.gz",
  "size": 1572864,
  "sizeFormatted": "1.5 MB",
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

**Error Response**:
```json
{
  "success": false,
  "filename": "unknown",
  "path": "unknown",
  "size": 0,
  "sizeFormatted": "0 B",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "_errors": ["Backup operation failed"],
  "_partial": true
}
```

## Backward Compatibility

### Adding New Jails

- ✅ Frontend handles dynamically (no hardcoded names)
- ✅ New jails appear automatically
- ✅ Category inference handles unknown jails

### Adding New Fields

- ✅ Use `_` prefix for backend-only fields
- ✅ Frontend ignores unknown fields
- ✅ Optional fields always present (null if not available)

### Changing Field Types

- ✅ Type coercion in serializer
- ✅ Safe defaults for type mismatches
- ✅ Validation before serialization

### Removing Fields

- ✅ Never remove required fields
- ✅ Optional fields can be null
- ✅ Deprecation period before removal

## Error Handling

### Error Response Format

All error responses follow this structure:
```typescript
{
  error?: string;                 // Human-readable error message
  code?: string;                   // Error code (e.g., "JAIL_NOT_FOUND")
  errors?: string[];              // Array of error messages
  // ... other fields based on endpoint
}
```

### Common Error Codes

- `INVALID_JAIL_NAME`: Jail name validation failed
- `JAIL_NOT_FOUND`: Requested jail does not exist
- `RATE_LIMIT_EXCEEDED`: Too many requests
- `SCRIPT_EXECUTION_FAILED`: Script execution error
- `FAIL2BAN_UNAVAILABLE`: fail2ban service unavailable

### Partial Data Responses

When fail2ban is down but other data is available:
- `_partial: true` flag is set
- `_errors` array contains error messages
- Available data is still returned (e.g., nginx stats, system info)

## Type Constraints

### Strings
- Never `undefined` or `null` (use empty string `""` or `"N/A"` for missing values)
- Always trimmed
- ISO-8601 timestamps for date fields

### Numbers
- Never `undefined` or `null` (use `0` for missing values)
- Integers for counts
- Floats for percentages/ratios

### Booleans
- Always `true` or `false` (never `undefined` or `null`)

### Arrays
- Never `null` or `undefined` (use empty array `[]`)
- Always arrays (never objects)

### Optional Fields
- Always present in response
- Use `null` if value is not available
- Never `undefined`

## Caching

All GET endpoints are cached:
- Overview: 10 seconds
- Jails: 5 seconds
- Nginx: 10 seconds
- System: 10 seconds
- Backup: No caching (POST endpoint)

Cache keys:
- `overview`
- `jails`
- `jail:{name}`
- `nginx`
- `system`

## Rate Limiting

- **General API**: 100 requests per 15 minutes per IP
- **Backup endpoint**: 5 requests per 5 minutes per IP

Rate limit headers:
- `X-RateLimit-Limit`: Maximum requests
- `X-RateLimit-Remaining`: Remaining requests
- `X-RateLimit-Reset`: Reset time (Unix timestamp)

## Authentication

All endpoints require Bearer token authentication:
```
Authorization: Bearer {token}
```

Token is configured via `AUTH_TOKEN` environment variable.

## Examples

### Complete Workflow

1. **Get overview**:
```bash
curl -H "Authorization: Bearer {token}" \
     -H "X-API-Version: 1.0.0" \
     https://api.example.com/api/overview
```

2. **Get all jails**:
```bash
curl -H "Authorization: Bearer {token}" \
     https://api.example.com/api/jails
```

3. **Get specific jail**:
```bash
curl -H "Authorization: Bearer {token}" \
     https://api.example.com/api/jails/sshd
```

4. **Get nginx stats**:
```bash
curl -H "Authorization: Bearer {token}" \
     https://api.example.com/api/nginx
```

5. **Get system info**:
```bash
curl -H "Authorization: Bearer {token}" \
     https://api.example.com/api/system
```

6. **Trigger backup**:
```bash
curl -X POST \
     -H "Authorization: Bearer {token}" \
     https://api.example.com/api/backup
```

## Migration Notes

### From Mock API to Real API

The frontend currently uses mock data. When switching to the real API:

1. Update `fetchJails` to call `/api/jails` instead of mock
2. Ensure `serverStatus` is handled correctly (`'online' | 'offline'`)
3. Backend-only fields (`_errors`, `_partial`) are safely ignored
4. All optional fields are present (null if not available)

### Version Updates

When API version changes:
1. Check `X-API-Version` header
2. Handle breaking changes if major version increments
3. Maintain backward compatibility for at least 2 major versions

## Testing

### Schema Validation

All responses are validated against this schema using the serializer:
- Type coercion ensures correct types
- Missing fields get safe defaults
- Unknown fields are stripped (unless prefixed with `_`)

### Test Cases

1. ✅ Empty jail list returns `[]` (not `null`)
2. ✅ Missing optional fields return `null` (not `undefined`)
3. ✅ New jails appear without frontend changes
4. ✅ Partial data when fail2ban is down
5. ✅ Type safety for all fields
6. ✅ Backend-only fields ignored by frontend

## Future Enhancements

- WebSocket support for real-time updates
- GraphQL endpoint (future version)
- Bulk operations (ban/unban multiple IPs)
- Historical data endpoints
- Export functionality (CSV, JSON)

