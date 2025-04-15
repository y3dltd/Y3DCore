'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '../ui/button';
import { toast } from 'sonner';
import { LogOut, Loader2 } from 'lucide-react';

export default function LogoutButton() {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleLogout = () => {
    if (isPending) return;
    startTransition(async () => {
      try {
        const response = await fetch('/api/auth/logout', {
          method: 'POST',
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: 'Logout failed' }));
            throw new Error(errorData.message || 'Logout failed');
        }

        toast.success('Logged out successfully');
        router.push('/login'); // Redirect to login page
        router.refresh(); // Refresh server components
      } catch (error) {
        console.error('Logout error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Logout failed';
        toast.error(`Logout failed: ${errorMessage}`);
      }
    });
  };

  return (
    <Button 
      variant="ghost" 
      size="sm" 
      onClick={handleLogout} 
      disabled={isPending}
      aria-label="Logout"
    >
      {isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <LogOut className="h-4 w-4" />
      )}
      <span className="sr-only">Logout</span>
    </Button>
  );
} 
