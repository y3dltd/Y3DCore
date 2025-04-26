// filepath: /workspaces/Y3DHub/src/lib/shared/database.ts
import { PrismaClient, Prisma } from '@prisma/client';
// Initialize Prisma Client
const prisma = new PrismaClient({
    log: ['query', 'info', 'warn', 'error'], // Configure logging as needed
});
// Export the Prisma client instance and Prisma types
export { prisma, Prisma };
// Optional: Add transaction helper function if needed frequently
export async function runInTransaction(fn) {
    return prisma.$transaction(fn);
}
// Optional: Add a function to gracefully disconnect Prisma
export async function disconnectPrisma() {
    await prisma.$disconnect();
}
// Ensure Prisma disconnects on application shutdown (example for Node.js)
process.on('beforeExit', async () => {
    console.log('Disconnecting Prisma...');
    await disconnectPrisma();
});
