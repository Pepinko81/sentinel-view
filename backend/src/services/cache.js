const config = require('../config/config');

class Cache {
  constructor() {
    this.cache = new Map();
  }
  
  /**
   * Get cached value if not expired
   * @param {string} key - Cache key
   * @returns {any|null} - Cached value or null if expired/missing
   */
  get(key) {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }
    
    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.value;
  }
  
  /**
   * Set cache value with TTL
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} ttlMs - TTL in milliseconds (optional, uses default if not provided)
   */
  set(key, value, ttlMs = null) {
    const ttl = ttlMs !== null ? ttlMs : config.cache.defaultTTL;
    const expiresAt = Date.now() + ttl;
    
    this.cache.set(key, {
      value,
      expiresAt,
      cachedAt: Date.now(),
    });
  }
  
  /**
   * Delete cache entry
   * @param {string} key - Cache key
   * @returns {boolean} - True if entry was deleted
   */
  delete(key) {
    return this.cache.delete(key);
  }
  
  /**
   * Delete multiple cache entries by pattern
   * @param {string|RegExp} pattern - Pattern to match keys
   * @returns {number} - Number of entries deleted
   */
  deleteByPattern(pattern) {
    let deleted = 0;
    const regex = typeof pattern === 'string' 
      ? new RegExp(pattern.replace(/\*/g, '.*')) 
      : pattern;
    
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
        deleted++;
      }
    }
    
    return deleted;
  }
  
  /**
   * Invalidate cache entries for a specific endpoint
   * @param {string} endpoint - Endpoint path (e.g., '/api/jails')
   * @returns {number} - Number of entries invalidated
   */
  invalidateEndpoint(endpoint) {
    return this.deleteByPattern(`cache:.*:${endpoint}`);
  }
  
  /**
   * Invalidate all cache entries
   * @returns {number} - Number of entries cleared
   */
  clear() {
    const size = this.cache.size;
    this.cache.clear();
    return size;
  }
  
  /**
   * Check if a key exists in cache (even if expired)
   * @param {string} key - Cache key
   * @returns {boolean} - True if key exists
   */
  has(key) {
    return this.cache.has(key);
  }
  
  /**
   * Get all cache keys
   * @returns {string[]} - Array of cache keys
   */
  keys() {
    return Array.from(this.cache.keys());
  }
  
  /**
   * Get cache statistics
   * @returns {object} - Cache stats
   */
  getStats() {
    const now = Date.now();
    let valid = 0;
    let expired = 0;
    let totalSize = 0;
    const endpoints = new Set();
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt > now) {
        valid++;
        // Estimate size (rough approximation)
        totalSize += JSON.stringify(entry.value).length;
      } else {
        expired++;
      }
      
      // Extract endpoint from cache key pattern: cache:GET:/api/overview
      const match = key.match(/cache:[^:]+:(.+)/);
      if (match) {
        endpoints.add(match[1]);
      }
    }
    
    return {
      total: this.cache.size,
      valid,
      expired,
      totalSizeBytes: totalSize,
      totalSizeFormatted: this.formatBytes(totalSize),
      endpoints: Array.from(endpoints),
      hitRate: null, // Can be calculated with additional tracking
    };
  }
  
  /**
   * Format bytes to human-readable string
   * @param {number} bytes - Bytes to format
   * @returns {string} - Formatted string
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }
  
  /**
   * Clean expired entries
   */
  cleanExpired() {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt <= now) {
        this.cache.delete(key);
      }
    }
  }
}

// Singleton instance
const cache = new Cache();

// Clean expired entries every minute
setInterval(() => {
  cache.cleanExpired();
}, 60000);

module.exports = cache;

