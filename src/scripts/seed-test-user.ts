#!/usr/bin/env tsx
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

import { hashPassword } from '../lib/server-only/auth-password';

async function main() {
  const prisma = new PrismaClient();
  // You can override these via env vars: SEED_TEST_EMAIL, SEED_TEST_PASSWORD
  const email = process.env.SEED_TEST_EMAIL || 'test@example.com';
  const rawPassword = process.env.SEED_TEST_PASSWORD || 'Test1234';
  console.log(`Seeding test user: ${email}`);
  const password = await hashPassword(rawPassword);
  const user = await prisma.user.create({
    data: { email, password },
  });
  console.log('✅ Created user:', { id: user.id, email: user.email });
  await prisma.$disconnect();
}

main()
  .then(() => process.exit(0))
  .catch(e => {
    console.error('❌ Error seeding user:', e);
    process.exit(1);
  });
