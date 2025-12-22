/**
 * Validate jail name - must be alphanumeric, dash, underscore only
 * @param {string} jailName - Jail name to validate
 * @returns {boolean} - True if valid
 */
function isValidJailName(jailName) {
  if (!jailName || typeof jailName !== 'string') {
    return false;
  }
  
  // Allow alphanumeric, dash, underscore, dot
  // This matches typical fail2ban jail naming conventions
  return /^[a-zA-Z0-9._-]+$/.test(jailName);
}

/**
 * Validate IP address format
 * @param {string} ip - IP address to validate
 * @returns {boolean} - True if valid IPv4
 */
function isValidIP(ip) {
  if (!ip || typeof ip !== 'string') {
    return false;
  }
  
  const parts = ip.split('.');
  if (parts.length !== 4) {
    return false;
  }
  
  return parts.every(part => {
    const num = parseInt(part, 10);
    return !isNaN(num) && num >= 0 && num <= 255;
  });
}

module.exports = {
  isValidJailName,
  isValidIP,
};

