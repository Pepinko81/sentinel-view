const crypto = require('crypto');

/**
 * Generate HMAC SHA256 signature
 * @param {string} secret - Secret key
 * @param {object} payload - Payload object
 * @returns {string} Hex signature
 */
function generateSignature(secret, payload) {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(JSON.stringify(payload));
  return hmac.digest('hex');
}

/**
 * Verify HMAC signature
 * @param {string} secret - Secret key
 * @param {object} payload - Payload object
 * @param {string} signature - Signature to verify
 * @returns {boolean} True if valid
 */
function verifySignature(secret, payload, signature) {
  const expected = generateSignature(secret, payload);
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}

module.exports = {
  generateSignature,
  verifySignature,
};

