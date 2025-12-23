# Automatic Filter File Creation

## Overview

The backend automatically creates filter files when enabling jails, eliminating the need for manual filter file creation in most cases.

## How It Works

When you enable a jail from the UI:

1. **Check Configuration**: Backend reads the jail configuration to determine the filter name
2. **Check Filter Existence**: Verifies if the filter file already exists
3. **Auto-Create if Missing**: If filter file is missing and a template exists, it creates it automatically
4. **Start Jail**: Attempts to start the jail

## Supported Filter Templates

The following filter types are automatically created if missing:

### nginx-webdav-attacks
Detects WebDAV exploitation attempts:
- PROPFIND, OPTIONS, MKCOL, PUT, DELETE
- MOVE, COPY, LOCK, UNLOCK methods

### nginx-hidden-files
Detects attempts to access hidden files:
- .env, .git, .aws, .ht files
- wp-config.php, configuration.php
- .DS_Store, .htpasswd

### nginx-admin-scanners
Detects admin panel scanning:
- /admin, /wp-admin, /wp-login
- /administrator, /phpmyadmin
- /mysql, /sql, /pma

### nginx-robots-scan
Detects excessive robots.txt requests

### nginx-404
Detects excessive 404 errors (scanning indicator)

### nginx-error-cycle
Detects rewrite cycle errors in nginx error logs

## Requirements

For automatic filter creation to work:

1. **Sudoers Configuration**: Must include `SENTINEL_FILTER_MGMT` alias
2. **Helper Script**: `/home/pepinko/sentinel-view/backend/scripts/create-filter-file.sh` must be executable
3. **Template Available**: Filter name must match one of the supported templates

## Manual Filter Creation

If automatic creation fails or your filter type is not supported:

1. **Use Diagnostic Script**:
   ```bash
   sudo /home/pepinko/sentinel-view/backend/scripts/diagnose-jail.sh <jail-name>
   ```

2. **Create Filter Manually**:
   ```bash
   sudo nano /etc/fail2ban/filter.d/<filter-name>.conf
   ```

3. **Use Template Scripts** (if available):
   ```bash
   sudo /home/pepinko/sentinel-view/backend/scripts/create-webdav-filter.sh
   ```

## Troubleshooting

### Filter Not Created Automatically

**Possible causes:**
1. Filter name doesn't match any template
2. Sudoers permissions missing
3. Helper script not executable
4. Insufficient disk space or permissions

**Solution:**
- Check backend logs for error messages
- Verify sudoers configuration includes `SENTINEL_FILTER_MGMT`
- Check script permissions: `ls -la backend/scripts/create-filter-file.sh`
- Create filter manually if needed

### Filter Created But Jail Still Fails

**Possible causes:**
1. Filter syntax error
2. Log path incorrect
3. Action configuration missing

**Solution:**
- Test filter: `sudo fail2ban-regex /var/log/nginx/access.log /etc/fail2ban/filter.d/<filter>.conf`
- Check jail configuration: `sudo grep -A 20 "[<jail-name>]" /etc/fail2ban/jail.local`
- Check fail2ban logs: `sudo tail -50 /var/log/fail2ban.log`

## Adding New Filter Templates

To add support for a new filter type:

1. **Add Template** to `backend/src/services/filterManager.js`:
   ```javascript
   const FILTER_TEMPLATES = {
     'new-filter-name': `[Definition]
   failregex = ...
   ignoreregex = 
   `,
   };
   ```

2. **Update Documentation**: Add to this file

3. **Test**: Enable a jail using the new filter type

## Security Considerations

- Filter files are created with root ownership
- Only predefined templates can be created automatically
- Custom filters must be created manually
- All filter operations are logged in audit logs

