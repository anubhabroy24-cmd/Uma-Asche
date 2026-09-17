/**
 * Simple input validation helpers.
 * Throws with a 400-friendly error object if validation fails.
 */

function assertString(value, fieldName, maxLen = 200) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    const err = new Error(`${fieldName} is required and must be a non-empty string.`);
    err.status = 400;
    throw err;
  }
  if (value.trim().length > maxLen) {
    const err = new Error(`${fieldName} must be ${maxLen} characters or less.`);
    err.status = 400;
    throw err;
  }
  return value.trim();
}

function assertRegion(region) {
  const valid = ['North Kolkata', 'South Kolkata', 'Central Kolkata', 'Salt Lake', 'South Suburban'];
  if (!valid.includes(region)) {
    const err = new Error(`region must be one of: ${valid.join(', ')}`);
    err.status = 400;
    throw err;
  }
  return region;
}

module.exports = { assertString, assertRegion };
