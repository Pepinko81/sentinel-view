/**
 * API Configuration
 * Defines API versioning and compatibility rules
 */

const API_VERSION = '1.0.0';

/**
 * API versioning strategy
 * - Current version: 1.0.0
 * - Version header: X-API-Version
 * - Backward compatibility: Maintained for at least 2 major versions
 */
const apiConfig = {
  version: API_VERSION,
  versionHeader: 'X-API-Version',
  
  // Backward compatibility rules
  compatibility: {
    // Minimum supported version
    minVersion: '1.0.0',
    // Fields that can be safely ignored by frontend
    ignoredFields: ['_errors', '_partial', '_serverStatus', '_warnings'],
    // Optional fields that must always be present (null if not available)
    requiredOptionalFields: ['category', 'filter', 'maxRetry', 'banTime'],
  },
  
  // Schema validation
  strictMode: process.env.NODE_ENV === 'production',
};

module.exports = {
  API_VERSION,
  apiConfig,
};

