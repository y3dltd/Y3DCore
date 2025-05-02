/**
 * Secure cryptographic utilities
 * 
 * Provides cryptographically secure random generation functions
 * for tokens, IDs, and other security-sensitive values.
 */

import { randomBytes } from 'crypto';


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
