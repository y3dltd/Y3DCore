'use client';

import { signOut } from 'next-auth/react';
import { toast } from 'sonner';

import { Button } from '../ui/button';

export default function LogoutButton() {
  const handleLogout = async () => {
    try {
      await signOut({ callbackUrl: '/login' }); // Sign out and redirect to login
      toast.success('Logged out successfully'); // Optional: Show success message
    } catch (error) {
      console.error('Logout Error:', error);
      toast.error('Logout failed. Please try again.'); // Show error message
    }
  };

  return (
    <Button onClick={handleLogout} variant="ghost" size="sm">
      Logout
    </Button>
  );
}
