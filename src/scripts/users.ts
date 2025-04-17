#!/usr/bin/env ts-node

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/server-only/auth-password';

async function createUser(email: string, password: string) {
  const hashed = await hashPassword(password);
  const user = await prisma.user.create({
    data: { email, password: hashed },
  });
  console.log('User created:', user);
}

async function changePassword(email: string, password: string) {
  const hashed = await hashPassword(password);
  const user = await prisma.user.update({
    where: { email },
    data: { password: hashed },
  });
  console.log('Password changed for:', user.email);
}

async function deleteUser(email: string) {
  await prisma.user.delete({ where: { email } });
  console.log('Deleted user:', email);
}

async function listUsers() {
  const users = await prisma.user.findMany();
  users.forEach(u => {
    console.log(`${u.id} | ${u.email}`);
  });
}

async function userInfo(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return console.log('User not found');
  console.log(user);
}

const cli = yargs(hideBin(process.argv))
  .scriptName('users')
  .command(
    'create <email> <password>',
    'Create a new user',
    y =>
      y
        .positional('email', { type: 'string', demandOption: true })
        .positional('password', { type: 'string', demandOption: true }),
    async argv => {
      await createUser(argv.email, argv.password);
      process.exit(0);
    }
  )
  .command(
    'changepass <email> <password>',
    'Change user password',
    y =>
      y
        .positional('email', { type: 'string', demandOption: true })
        .positional('password', { type: 'string', demandOption: true }),
    async argv => {
      await changePassword(argv.email, argv.password);
      process.exit(0);
    }
  )
  .command(
    'delete <email>',
    'Delete a user',
    y => y.positional('email', { type: 'string', demandOption: true }),
    async argv => {
      await deleteUser(argv.email);
      process.exit(0);
    }
  )
  .command('list', 'List all users', {}, async () => {
    await listUsers();
    process.exit(0);
  })
  .command(
    'info <email>',
    'Show user info',
    y => y.positional('email', { type: 'string', demandOption: true }),
    async argv => {
      await userInfo(argv.email);
      process.exit(0);
    }
  )
  .demandCommand()
  .help()
  .strict();

cli.parse();
