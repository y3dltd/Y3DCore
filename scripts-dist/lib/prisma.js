import { PrismaClient } from '@prisma/client';
export const prisma = global.prisma ||
    new PrismaClient({
        // Log Prisma queries in development
        log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
        // Set global transaction timeout to 5 minutes
        transactionOptions: {
            maxWait: 120000,
            timeout: 300000, // 5 minutes in milliseconds
        },
    });
if (process.env.NODE_ENV !== 'production') {
    global.prisma = prisma;
}
