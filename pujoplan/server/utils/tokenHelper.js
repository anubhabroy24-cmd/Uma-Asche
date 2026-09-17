const { nanoid } = require('nanoid');

/**
 * Generates a URL-safe random token for group invite links.
 */
function generateToken(length = 12) {
  return nanoid(length);
}

module.exports = { generateToken };
