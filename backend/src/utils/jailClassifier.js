/**
 * Infer category from jail name
 * @param {string} jailName - Name of the jail
 * @returns {string} - Category: "SSH" | "Nginx" | "HTTP" | "System" | "Other"
 */
function inferCategory(jailName) {
  if (!jailName || typeof jailName !== 'string') {
    return 'Other';
  }
  
  const name = jailName.toLowerCase();
  
  // SSH-related jails
  if (name.startsWith('sshd') || name.includes('ssh')) {
    return 'SSH';
  }
  
  // Nginx-related jails
  if (name.startsWith('nginx') || name.includes('nginx')) {
    return 'Nginx';
  }
  
  // Apache/HTTP-related jails
  if (name.startsWith('apache') || name.includes('http-auth') || name.includes('http')) {
    return 'HTTP';
  }
  
  // System/mail-related jails
  if (
    name.startsWith('postfix') ||
    name.startsWith('dovecot') ||
    name.startsWith('recidive') ||
    name.startsWith('pam-') ||
    name.includes('system') ||
    name.includes('selinux')
  ) {
    return 'System';
  }
  
  return 'Other';
}

/**
 * Infer severity based on banned count and jail type
 * @param {string} jailName - Name of the jail
 * @param {number} bannedCount - Number of banned IPs
 * @returns {string} - Severity: "low" | "medium" | "high"
 */
function inferSeverity(jailName, bannedCount) {
  const category = inferCategory(jailName);
  const categoryLower = category.toLowerCase();
  
  // High severity thresholds
  const highThresholds = {
    ssh: 20,
    nginx: 30,
    http: 30,
    system: 15,
    other: 20,
  };
  
  // Medium severity thresholds
  const mediumThresholds = {
    ssh: 5,
    nginx: 10,
    http: 10,
    system: 3,
    other: 5,
  };
  
  const highThreshold = highThresholds[categoryLower] || 20;
  const mediumThreshold = mediumThresholds[categoryLower] || 5;
  
  if (bannedCount >= highThreshold) {
    return 'high';
  } else if (bannedCount >= mediumThreshold) {
    return 'medium';
  } else {
    return 'low';
  }
}

module.exports = {
  inferCategory,
  inferSeverity,
};

