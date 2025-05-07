'use client';

import { Loader2 } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { FormEvent, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const searchParams = useSearchParams();
  // Safely get and validate the callback URL
  let callbackUrl = '/';
  try {
    const rawCallbackUrl = searchParams.get('callbackUrl');
    if (rawCallbackUrl && rawCallbackUrl.trim() !== '') {
      // Validate it's a relative URL or an absolute URL on the same domain
      // For relative URLs, we can just use them directly
      if (rawCallbackUrl.startsWith('/')) {
        callbackUrl = rawCallbackUrl;
      } else {
        // For anything else, default to home page
        console.warn('Invalid callbackUrl, defaulting to home:', rawCallbackUrl);
      }
    }
  } catch (e) {
    console.error('Error parsing callbackUrl:', e);
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isPending) return;

    startTransition(async () => {
      try {
        const result = await signIn('credentials', {
          redirect: false,
          email: email,
          password: password,
        });

        if (result?.error) {
          console.error('SignIn Error:', result.error);
          toast.error(`Login failed: ${result.error}`);
        } else if (result?.ok) {
          toast.success('Login successful!');
          
          // Fix redirect loop - if callbackUrl is '/login' or contains '/login?', redirect to home
          const redirectUrl = callbackUrl === '/login' || callbackUrl.includes('/login?') 
            ? '/' 
            : callbackUrl;
            
          router.push(redirectUrl);
          router.refresh();
        } else {
          toast.error('Login failed: An unexpected error occurred.');
        }
      } catch (error) {
        console.error('Login Exception:', error);
        toast.error('Login failed: Network error or unexpected issue.');
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
              <Label htmlFor="email">Email</Label>
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
            <div className="space-y-2">
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
