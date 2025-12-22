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
   */
  delete(key) {
    this.cache.delete(key);
  }
  
  /**
   * Clear all cache
   */
  clear() {
    this.cache.clear();
  }
  
  /**
   * Get cache statistics
   * @returns {object} - Cache stats
   */
  getStats() {
    const now = Date.now();
    let valid = 0;
    let expired = 0;
    
    for (const entry of this.cache.values()) {
      if (entry.expiresAt > now) {
        valid++;
      } else {
        expired++;
      }
    }
    
    return {
      total: this.cache.size,
      valid,
      expired,
    };
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

