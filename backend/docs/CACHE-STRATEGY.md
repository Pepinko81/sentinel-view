# Cache Strategy & Rate Limiting

## Overview

The backend implements a multi-layered approach to reduce system load and prevent DoS attacks:
1. **Per-IP Rate Limiting** - Prevents excessive requests from single IPs
2. **Response Caching** - Reduces sudo command execution frequency
3. **Shared Cache** - Same data for all clients (optimal for monitoring)

## Rate Limiting

### Per-IP Tracking

Rate limiting uses per-IP tracking to ensure fair resource usage:

```javascript
keyGenerator: (req) => {
  return req.ip || req.connection.remoteAddress || 'unknown';
}
```

**Benefits:**
- Each client has independent rate limit counter
- Prevents single IP from exhausting resources
- Protects against DoS attacks

### Rate Limit Configuration

**Default Settings:**
- **Window**: 60 seconds (1 minute)
- **Max Requests**: 100 per window per IP
- **Backup Endpoint**: 5 requests per 5 minutes (stricter)

**Why These Limits:**
- 100 requests/minute = ~1.67 requests/second per IP
- Sufficient for dashboard polling (typically 30s intervals)
- Prevents abuse while allowing legitimate use
- Backup endpoint is stricter due to resource intensity

### Rate Limit Headers

Responses include rate limit information:

```
RateLimit-Limit: 100
RateLimit-Remaining: 95
RateLimit-Reset: 1633024800
```

## Caching Strategy

### Shared Cache (Not Per-IP)

The cache is **shared across all clients**:

```javascript
const key = 'cache:GET:/api/overview';
// Same cache for all IPs
```

**Why Shared Cache:**
- Monitoring data is the same for all clients
- Reduces sudo command execution significantly
- Lower memory usage
- Faster responses

**Tradeoffs:**
- ✅ Faster responses (no duplicate sudo calls)
- ✅ Lower system load
- ✅ Lower memory usage
- ❌ All clients see same cached data (acceptable for monitoring)

### Cache TTL by Endpoint

Different endpoints have different TTLs based on data freshness needs:

| Endpoint | TTL | Reason |
|----------|-----|--------|
| `/api/overview` | 5 seconds | Real-time monitoring |
| `/api/jails` | 5 seconds | Jail status changes frequently |
| `/api/nginx` | 10 seconds | Nginx stats update less frequently |
| `/api/system` | 30 seconds | System info changes slowly |
| `/api/backup` | No cache | Always execute (idempotent) |

### Cache Invalidation

**Automatic:**
- Entries expire after TTL
- Cleanup runs every 60 seconds

**Manual:**
```javascript
// Invalidate specific endpoint
cache.invalidateEndpoint('/api/jails');

// Invalidate by pattern
cache.deleteByPattern('cache:GET:/api/*');

// Clear all cache
cache.clear();
```

## Cache Statistics

Monitor cache performance:

```javascript
const stats = cache.getStats();
// {
//   total: 5,
//   valid: 4,
//   expired: 1,
//   totalSizeBytes: 10240,
//   totalSizeFormatted: '10 KB',
//   endpoints: ['/api/overview', '/api/jails']
// }
```

## Performance Impact

### Without Caching

**Scenario**: 10 clients polling every 5 seconds
- Requests: 120 requests/minute
- Sudo calls: 120 calls/minute
- System load: High (constant sudo execution)

### With Caching (5s TTL)

**Scenario**: 10 clients polling every 5 seconds
- Requests: 120 requests/minute
- Sudo calls: ~12 calls/minute (10x reduction)
- System load: Low (cached responses)

### Cache Hit Rate

Expected hit rate: **80-90%** for typical dashboard usage
- First request: Cache miss (executes script)
- Subsequent requests: Cache hit (returns cached data)
- After TTL: Cache miss (refreshes data)

## Best Practices

### 1. Set Appropriate TTLs

- **Too short**: Frequent cache misses, high system load
- **Too long**: Stale data, poor user experience
- **Optimal**: Balance between freshness and performance

### 2. Monitor Cache Statistics

Regularly check cache stats to ensure:
- Hit rate is acceptable (>70%)
- Memory usage is reasonable
- Expired entries are cleaned up

### 3. Invalidate on Changes

If fail2ban configuration changes:
```javascript
// Invalidate jail-related caches
cache.invalidateEndpoint('/api/jails');
cache.invalidateEndpoint('/api/overview');
```

### 4. Rate Limit Configuration

Adjust rate limits based on:
- Expected number of clients
- Typical request patterns
- System capacity

## Troubleshooting

### High System Load

**Symptoms**: High CPU/memory from sudo calls

**Solutions**:
- Increase cache TTL (if data freshness allows)
- Increase rate limit window
- Check for cache misses (low hit rate)

### Stale Data

**Symptoms**: Dashboard shows outdated information

**Solutions**:
- Decrease cache TTL
- Add manual cache invalidation
- Check cache expiration logic

### Rate Limit Issues

**Symptoms**: Legitimate clients getting 429 errors

**Solutions**:
- Increase `RATE_LIMIT_MAX`
- Increase `RATE_LIMIT_WINDOW`
- Check for misconfigured clients (too frequent polling)

## Configuration

Environment variables for tuning:

```bash
# Rate limiting
RATE_LIMIT_WINDOW=60000      # 1 minute
RATE_LIMIT_MAX=100            # requests per window

# Cache TTLs (milliseconds)
CACHE_TTL=5000                # Default
CACHE_OVERVIEW_TTL=5000       # Overview endpoint
CACHE_JAILS_TTL=5000          # Jails endpoint
CACHE_NGINX_TTL=10000         # Nginx endpoint
CACHE_SYSTEM_TTL=30000        # System endpoint
```

## Security Considerations

1. **Rate Limiting**: Prevents DoS attacks
2. **Cache**: Reduces attack surface (fewer sudo calls)
3. **Per-IP**: Prevents single client from exhausting resources
4. **Shared Cache**: Acceptable for monitoring data (not user-specific)

## References

- [express-rate-limit Documentation](https://github.com/nfriedly/express-rate-limit)
- [Cache Invalidation Strategies](https://en.wikipedia.org/wiki/Cache_invalidation)

