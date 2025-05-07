import { PrismaClient } from '@prisma/client';

// PrismaClient is attached to the `global` object in development to prevent
// exhausting your database connection limit.
//
// Learn more: https://pris.ly/d/help/next-js-best-practices

// Get a valid database URL, handling various edge cases in Vercel and other environments
function getValidDatabaseUrl(): string {
  // Set of known valid database URLs in order of preference
  const possibleUrls = [
    process.env.DATABASE_URL,
    process.env.DATABASE_URL_FALLBACK,
    process.env.MYSQL_URL,
    process.env.DB_URL
  ];
  
  // Try each possible URL
  for (const url of possibleUrls) {
    if (!url) continue;
    
    let dbUrl = url.trim();
    
    // Skip URLs that contain unresolved variables
    if (dbUrl.includes('${') || dbUrl.includes('$DATABASE_URL')) {
      console.warn(`Skipping database URL with unresolved variable: ${dbUrl.substring(0, 10)}...`);
      continue;
    }
    
    // Add mysql:// prefix if missing
    if (!dbUrl.startsWith('mysql://')) {
      console.info('Adding mysql:// prefix to database URL');
      dbUrl = 'mysql://' + dbUrl;
    }
    
    // Verify the URL is properly formatted
    try {
      // Basic validation - URL should now have mysql:// prefix and contain @
      if (dbUrl.includes('@')) {
        console.log(`Using database URL: ${dbUrl.substring(0, 10)}...`);
        // Update environment variable with valid URL
        process.env.DATABASE_URL = dbUrl;
        return dbUrl;
      }
    } catch (e) {
      console.error('Error validating database URL:', e);
    }
  }
  
  // If we get here, no valid URL was found
  console.error('No valid database URL found in any environment variable');
  // Return the original DATABASE_URL (which might be invalid) as a last resort
  return process.env.DATABASE_URL || '';
}

// Set DATABASE_URL to a valid value before Prisma initialization
getValidDatabaseUrl();

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
