// import { Suspense } from 'react'; // Removed unused import
import { AlertTriangle } from 'lucide-react';
import { getServerSession } from 'next-auth/next';

import { authOptions } from '@/app/api/auth/[...nextauth]/route';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { UsersTable } from '@/components/users-table'; // Client component for the table
// import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// Admin User ID - Replace with role-based check later if possible
const ADMIN_USER_ID = 1;

async function getUsers() {
  // Exclude passwords when fetching
  return await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      email: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export default async function UsersPage() {
  // Get session server-side
  const session = await getServerSession(authOptions);

  // Perform Authorization Check based on session
  // Note: user ID from session might be string, parse if needed or compare directly if ADMIN_USER_ID is string
  const currentUserId = session?.user?.id ? parseInt(session.user.id, 10) : null;

  if (!session || !session.user || currentUserId !== ADMIN_USER_ID) {
    return (
      <div className="container mx-auto py-10">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Unauthorized</AlertTitle>
          <AlertDescription>You do not have permission to access this page.</AlertDescription>
        </Alert>
      </div>
    );
  }

  const users = await getUsers();

  // Define a type for the user data passed to the client component
  // This ensures password isn't accidentally included in the type
  type UserDataForTable = Omit<Awaited<ReturnType<typeof getUsers>>[number], 'password'>;

  return (
    <div className="container mx-auto py-10 space-y-6">
      <h1 className="text-3xl font-bold">Manage Users</h1>
      <p className="text-muted-foreground">
        Add, edit, or remove users. Remember that user ID 1 is the primary admin.
      </p>
      {/* 
        TODO: Add Suspense boundary if fetching users takes time, 
        or if table component itself needs further data fetching 
      */}
      <UsersTable users={users as UserDataForTable[]} />
    </div>
  );
}
