'use client';

import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { FormEvent, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function LoginPage() {
  const [email, setEmail] = useState('mock@example.com'); // Pre-fill mock email
  // const [password, setPassword] = useState(''); // Password no longer needed
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isPending) return;

    startTransition(async () => {
      try {
        // No need to send email/password for mock login
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // Empty body or a dummy object if required by server
          body: JSON.stringify({ email }), // Still sending email for potential logging
          // credentials: 'include', // No longer needed as no session cookie is set/read
        });

        if (!response.ok) {
          const errorData = await response
            .json()
            .catch(() => ({ message: 'An unknown error occurred' }));
          throw new Error(errorData.message || 'Mock Login failed');
        }

        // Mock Login successful
        toast.success('Mock Login successful!');
        router.push('/');
        // No need to refresh for auth state as it's mocked
        // router.refresh();
      } catch (error) {
        console.error('Mock Login error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Mock Login failed';
        toast.error(`Mock Login failed: ${errorMessage}`);
      }
    });
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-muted/40">
      <Card className="w-full max-w-sm mx-auto">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold">Mock Login</CardTitle>
          <CardDescription>Click login to proceed (no password required)</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email (Mock)</Label>
              <Input
                id="email"
                type="email"
                placeholder="m@example.com"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                disabled={isPending}
                autoComplete="username"
              />
            </div>
            {/* Password field removed */}
            {/* <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                required
                value={password}
                onChange={e => setPassword(e.target.value)}
                disabled={isPending}
                autoComplete="current-password"
              />
            </div> */}
            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Login
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
