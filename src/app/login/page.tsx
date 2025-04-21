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
  const [email, setEmail] = useState('mock@example.com'); // Keep mock email for convenience
  const [password, setPassword] = useState(''); // Restore password state
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isPending) return;

    startTransition(async () => {
      try {
        // Backend ignores password, but we simulate sending it
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }), // Include password state visually
        });

        if (!response.ok) {
          const errorData = await response
            .json()
            .catch(() => ({ message: 'An unknown error occurred' }));
          // Simulate a generic error, as backend always succeeds
          throw new Error(errorData.message || 'Login failed (simulated)');
        }

        // Login successful (mock backend)
        toast.success('Login successful!'); // User sees normal success
        router.push('/');
      } catch (error) {
        console.error('Login UI error (backend is mocked):', error);
        const errorMessage = error instanceof Error ? error.message : 'Login failed';
        toast.error(`Login failed: ${errorMessage}`);
      }
    });
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-muted/40">
      <Card className="w-full max-w-sm mx-auto">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold">Login</CardTitle>
          <CardDescription>Enter your email and password to login</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label> {/* Remove (Mock) */}
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
            {/* Restore Password field */}
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                required
                value={password} // Use password state
                onChange={e => setPassword(e.target.value)} // Update password state
                disabled={isPending}
                autoComplete="current-password"
              />
            </div>
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
