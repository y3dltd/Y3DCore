/**
 * Secure cryptographic utilities
 * 
 * Provides cryptographically secure random generation functions
 * for tokens, IDs, and other security-sensitive values.
 */

import { randomBytes } from 'crypto';

/**
 * Generates a cryptographically secure random token
 * 
 * @param length - Length of the token in bytes (default: 32)
 * @returns A secure random token as a hex string
 */
export function generateSecureToken(length = 32): string {
  return randomBytes(length).toString('hex');
}

/**
 * Generates a cryptographically secure random number
 * 
 * @param min - Minimum value (inclusive)
 * @param max - Maximum value (exclusive)
 * @returns A secure random number in the given range
 */
export function generateSecureRandomNumber(min: number, max: number): number {
  // Get a random value between 0 and 1
  const secureRandomValue = randomBytes(4).readUInt32LE() / 0x100000000;
  // Scale to the range
  return Math.floor(secureRandomValue * (max - min) + min);
}

/**
 * Generates a cryptographically secure random mock ID
 * for use in dry run modes
 * 
 * @returns A negative random ID to indicate it's a mock
 */
export function generateSecureMockId(): number {
  return -generateSecureRandomNumber(1, 1000000);
}
