# Server Scripts Integration

## Overview

The backend has been updated to use the **actual server scripts** located at `/opt/fail2ban-dashboard/scripts/`. These scripts are the **single source of truth** and are NOT modified by the backend.

## Script Mapping

### monitor-security.sh → Main Data Source
- **Used by**: `/api/overview`, `/api/jails`, `/api/nginx`, `/api/system`
- **Output**: Comprehensive security monitoring data including:
  - fail2ban status and jail list
  - Banned IPs per jail
  - Nginx statistics (404s, admin scans, WebDAV attacks, hidden files)
  - System resources (memory, disk, load, uptime)
- **Parser**: `monitorParser.js` - Handles Bulgarian/English mixed output

### quick-check.sh → Quick Status
- **Used by**: Fallback for `/api/jails` if monitor-security.sh fails
- **Output**: Quick overview of jails, banned IPs, recent attacks
- **Parser**: `monitorParser.js` (parseQuickCheck function)

### backup-fail2ban.sh → Backup
- **Used by**: `/api/backup`
- **Output**: Backup file path, size, success status
- **Parser**: `backupParser.js`
- **Backup Location**: `/home/pepinko/fail2ban-backups/`

### test-fail2ban.sh → Diagnostics
- **Available for**: Future diagnostics endpoint
- **Output**: Comprehensive fail2ban test results

### test-filters.sh → Filter Testing
- **Available for**: Future filter testing endpoint
- **Output**: Filter test results against real logs

## Parser Architecture

### monitorParser.js
- `parseMonitorOutput()` - Main parser for monitor-security.sh
  - Extracts fail2ban status, jails, banned IPs
  - Parses nginx statistics
  - Extracts system resources
  - Handles Bulgarian text mixed with English

- `parseQuickCheck()` - Parser for quick-check.sh
  - Extracts jail list
  - Counts banned IPs
  - Recent attacks count

### nginxParser.js
- Updated to handle output from monitor-security.sh
- Extracts: 404_count, admin_scans, webdav_attacks, hidden_files_attempts

### backupParser.js
- New parser for backup-fail2ban.sh output
- Extracts: backup file path, size, success status

## Configuration Changes

1. **Script Directory**: Now points to `/opt/fail2ban-dashboard/scripts/`
   - Configurable via `SCRIPTS_DIR` environment variable
   - Default: `../../../opt/fail2ban-dashboard/scripts` (relative to backend/src)

2. **Script Whitelist**: Updated to include actual server scripts:
   - `test-fail2ban.sh`
   - `monitor-security.sh`
   - `quick-check.sh`
   - `backup-fail2ban.sh`
   - `test-filters.sh`

## Security

- Scripts are executed with `sudo` (configured in sudoers)
- Only whitelisted scripts can be executed
- Script paths are validated before execution
- No user input is passed directly to shell commands
- Arguments are validated (jail names must match regex pattern)

## Output Format Handling

The scripts output human-readable text in Bulgarian and English. The parsers:

1. **Detect sections** using Bulgarian headers (🔒, 🚫, 📊, 💾)
2. **Extract structured data** using regex patterns
3. **Handle variations** in output format
4. **Normalize to JSON** matching frontend schema

## Error Handling

- If `monitor-security.sh` fails, routes attempt fallback to `quick-check.sh`
- Partial data is returned if some sections fail to parse
- Graceful degradation ensures API always returns valid JSON

## Testing

To test the integration:

1. Verify scripts are executable:
   ```bash
   ls -la /opt/fail2ban-dashboard/scripts/
   ```

2. Test script execution:
   ```bash
   sudo /opt/fail2ban-dashboard/scripts/monitor-security.sh
   ```

3. Test API endpoint:
   ```bash
   curl -H "Authorization: Bearer your-token" http://localhost:3002/api/overview
   ```

## Future Enhancements

- Add endpoint for `test-filters.sh` output
- Add endpoint for `test-fail2ban.sh` diagnostics
- Cache individual jail details separately
- Add real-time streaming for monitoring data

