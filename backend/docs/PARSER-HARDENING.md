# Parser Hardening & Validation

## Overview

All parsers have been hardened to handle fail2ban downtime gracefully, replace brittle position-based parsing with anchor-based parsing, and provide safe defaults for missing data.

## Key Improvements

### 1. Parser Utilities (`parserUtils.js`)

New utility functions provide robust parsing infrastructure:

- **`safeParse()`** - Wraps parsers with try-catch and validation
- **`validateOutput()`** - Validates input before parsing
- **`findValueAfterAnchor()`** - Anchor-based value extraction (replaces `lines[i + 1]`)
- **`extractSection()`** - Extract sections between anchors
- **`detectFail2banError()`** - Detects fail2ban service errors
- **`extractIPs()`** - Robust IP address extraction

### 2. Position-Based → Anchor-Based Parsing

**Before (Brittle)**:
```javascript
if (line.includes('404 грешки:') && i + 1 < lines.length) {
  const count = parseInt(lines[i + 1], 10); // Breaks if format changes
}
```

**After (Robust)**:
```javascript
if (line.includes('404 грешки:')) {
  const count = findValueAfterAnchor(lines, line, 3); // Searches forward
}
```

**Benefits**:
- ✅ Works even if output format changes slightly
- ✅ Handles missing lines gracefully
- ✅ Searches multiple lines forward (configurable)

### 3. Error Detection & Handling

All parsers now:
- ✅ Validate input before parsing
- ✅ Detect fail2ban service errors
- ✅ Return error arrays in response
- ✅ Use safe defaults for missing data
- ✅ Never crash on malformed input

### 4. Fail2ban Downtime Handling

**Scenarios Handled**:
- fail2ban service stopped → Returns partial data with error flag
- fail2ban-client returns error → Detects and flags error
- Empty or partial script output → Returns safe defaults

**Response Format**:
```json
{
  "summary": {
    "active_jails": 0,
    "total_banned_ips": 0
  },
  "jails": [],
  "nginx": {
    "404_count": 150,
    "admin_scans": 23
  },
  "system": {
    "memory": "2.5G/8G",
    "disk": "45G/100G"
  },
  "errors": [
    "fail2ban service unavailable - nginx and system data available"
  ],
  "partial": true,
  "serverStatus": "partial"
}
```

## Parser-Specific Improvements

### fail2banParser.js

**Improvements**:
- ✅ Detects fail2ban service errors (connection refused, service down)
- ✅ Improved IP extraction (handles multiline IP lists)
- ✅ Better jail name extraction (searches forward, not just next line)
- ✅ Safe defaults for all fields
- ✅ Error tracking

**Error Detection**:
- Connection refused
- Service not running
- Permission denied
- Command not found
- Empty output

### monitorParser.js

**Improvements**:
- ✅ Replaced all `lines[i + 1]` with `findValueAfterAnchor()`
- ✅ Flexible section detection (handles Bulgarian/English)
- ✅ Improved jail parsing (flexible regex)
- ✅ Better nginx stats extraction
- ✅ Error tracking

**Position-Based → Anchor-Based**:
- Total requests: `findValueAfterAnchor(lines, 'Общо заявки', 3)`
- 404 errors: `findValueAfterAnchor(lines, '404', 3)`
- Admin scans: `findValueAfterAnchor(lines, 'Admin скенери', 3)`
- All nginx stats use anchor-based parsing

### nginxParser.js

**Improvements**:
- ✅ All parsing uses anchor-based approach
- ✅ Safe defaults for all fields
- ✅ Handles missing sections gracefully
- ✅ Error tracking

### systemParser.js

**Improvements**:
- ✅ Safe defaults for all fields
- ✅ Flexible matching (handles format variations)
- ✅ Error tracking
- ✅ Fallback to OS defaults if parsing fails

### backupParser.js

**Improvements**:
- ✅ Input validation
- ✅ Error detection (success/failure indicators)
- ✅ Flexible path extraction
- ✅ Error tracking

## Route Error Handling

All routes now:

1. **Wrap parser calls** with `safeParse()`
2. **Check for fail2ban errors** using `detectFail2banError()`
3. **Return partial data** when fail2ban is down (nginx/system still work)
4. **Include error arrays** in responses
5. **Set `partial` flag** when data is incomplete

### Example: Overview Route

```javascript
const { stdout, stderr } = await executeScript('monitor-security.sh');

// Check for fail2ban errors
const errorCheck = detectFail2banError(stdout, stderr);
if (errorCheck.isError) {
  // Parse what we can (nginx/system might still work)
  monitorData = safeParse(parseMonitorOutput, stdout, defaultMonitorOutput);
  monitorData.errors.push(errorCheck.message);
  monitorData.partial = true;
} else {
  monitorData = safeParse(parseMonitorOutput, stdout, defaultMonitorOutput);
}
```

## Error Response Examples

### Complete Failure

```json
{
  "timestamp": "2024-01-01T12:00:00Z",
  "summary": { "active_jails": 0, "total_banned_ips": 0 },
  "jails": [],
  "nginx": { "404_count": 0, "admin_scans": 0, ... },
  "system": { "memory": "N/A", "disk": "N/A", ... },
  "errors": ["Script execution failed: Connection refused"],
  "partial": true,
  "serverStatus": "error"
}
```

### Partial Data (fail2ban down, nginx/system OK)

```json
{
  "timestamp": "2024-01-01T12:00:00Z",
  "summary": { "active_jails": 0, "total_banned_ips": 0 },
  "jails": [],
  "nginx": { "404_count": 150, "admin_scans": 23, ... },
  "system": { "memory": "2.5G/8G", "disk": "45G/100G", ... },
  "errors": ["fail2ban service unavailable - nginx and system data available"],
  "partial": true,
  "serverStatus": "partial"
}
```

### Success with Warnings

```json
{
  "timestamp": "2024-01-01T12:00:00Z",
  "summary": { "active_jails": 5, "total_banned_ips": 42 },
  "jails": [...],
  "nginx": { "404_count": 150, ... },
  "system": { "memory": "2.5G/8G", ... },
  "errors": ["Failed to parse some nginx statistics"],
  "partial": false,
  "serverStatus": "online"
}
```

## Testing Scenarios

### ✅ fail2ban Service Stopped

**Test**: Stop fail2ban service
**Expected**: 
- Backend continues running
- Returns partial data with `serverStatus: "partial"` or `"offline"`
- nginx/system data still available
- Clear error message in `errors` array

### ✅ Empty Script Output

**Test**: Script returns empty string
**Expected**:
- Returns safe defaults
- `partial: true`
- Error in `errors` array: "Empty input"

### ✅ Malformed Output

**Test**: Script output has unexpected format
**Expected**:
- Parses what it can
- Uses safe defaults for missing fields
- Errors logged but doesn't crash
- `partial: true` if any errors

### ✅ Missing Sections

**Test**: Script output missing nginx section
**Expected**:
- Returns safe defaults for nginx (all zeros)
- Other sections still parsed
- `partial: true` if critical sections missing

### ✅ Output Format Change

**Test**: Script output format changes slightly
**Expected**:
- Anchor-based parsing still works
- Searches forward for values
- Handles format variations gracefully

## Risky Patterns Removed

### ❌ Position-Based Parsing

**Removed**:
- `lines[i + 1]` - Assumes next line is always value
- `lines[i + 2]` - Position-dependent
- Direct array indexing without bounds checking

**Replaced with**:
- `findValueAfterAnchor()` - Searches forward from anchor
- Flexible line matching
- Bounds checking

### ❌ Brittle Regex

**Improved**:
- Bulgarian text matching made more flexible
- IP extraction more robust
- Case-insensitive matching where appropriate

### ❌ No Error Handling

**Added**:
- Try-catch blocks in all parsers
- Input validation
- Safe defaults
- Error tracking

## Benefits

1. **Resilience**: Backend never crashes on parser errors
2. **Graceful Degradation**: Partial data when services are down
3. **Maintainability**: Anchor-based parsing is more robust
4. **Debugging**: Error arrays help identify issues
5. **User Experience**: Frontend always receives valid JSON

## Migration Notes

- All parsers now return `errors` array (may be empty)
- All parsers now return `partial` flag
- Routes handle `partial: true` and show appropriate UI
- Frontend should check `errors` array and `partial` flag
- `serverStatus` indicates overall health: `"online" | "partial" | "offline" | "error"`

## Future Improvements

- Add parser unit tests with various output formats
- Add metrics for parser error rates
- Consider caching parsed data structure
- Add parser performance monitoring

