import { hash, compare } from 'bcryptjs';

// Function to hash a password (Node.js only)
export async function hashPassword(password: string): Promise<string> {
  const hashedPassword = await hash(password, 10);
  return hashedPassword;
}

// Function to verify a password (Node.js only)
export async function verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
  const isValid = await compare(password, hashedPassword);
  return isValid;
}
