import { PrismaClient } from '@prisma/client';

// PrismaClient is attached to the `global` object in development to prevent
// exhausting your database connection limit.
//
// Learn more: https://pris.ly/d/help/next-js-best-practices

declare global {
  // allow global `var` declarations
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

export const prisma =
  global.prisma ||
  new PrismaClient({
    // Log Prisma queries in development
    log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
    // Set global transaction timeout to 5 minutes
    transactionOptions: {
      maxWait: 120000, // 2 minutes in milliseconds
      timeout: 300000, // 5 minutes in milliseconds
    },
  });

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}
