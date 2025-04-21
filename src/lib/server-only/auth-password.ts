import bcrypt from 'bcryptjs';

// NOTE: These functions are currently only used for DB compatibility
// in the mock auth setup, not for active security checks.

const SALT_ROUNDS = 10;

// Function to hash a password (Node.js only)
export async function hashPassword(password: string): Promise<string> {
  const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
  return hashedPassword;
}

// Function to verify a password (Node.js only)
export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  const isValid = await bcrypt.compare(password, hashedPassword);
  return isValid;
}
