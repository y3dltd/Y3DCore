'use client';

import Image from 'next/image'; // Import the Image component
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { checkAuthStatus, hasSessionCookie } from '@/lib/auth-client';

import { Button } from '../ui/button';
import LogoutButton from './logout-button'; // Import the client component

// Client-side component to manage auth state
export default function Navbar() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const router = useRouter();

  // Check auth status on load and after route changes
  useEffect(() => {
    const checkAuth = async () => {
      // First, do a simple client-side check if the session cookie exists
      const hasCookie = hasSessionCookie();

      if (hasCookie) {
        try {
          // Verify the session is valid by fetching the user info
          const { isAuthenticated, userData } = await checkAuthStatus();

          if (isAuthenticated && userData) {
            setIsLoggedIn(true);
            setUserEmail(userData.email || 'User');
          } else {
            setIsLoggedIn(false);
            setUserEmail(null);
          }
        } catch (error) {
          console.error('Failed to verify authentication:', error);
          setIsLoggedIn(false);
          setUserEmail(null);
        }
      } else {
        setIsLoggedIn(false);
        setUserEmail(null);
      }
    };

    checkAuth();
  }, [router]);

  return (
    <nav className="bg-card border-b sticky top-0 z-50 shadow-sm">
      <div className="mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Left side: Logo/Brand - Increase vertical padding */}
          <div className="flex-shrink-0 py-3">
            <Link href="/">
              <Image
                src="/logo.png" // Update path to logo.png
                alt="Yorkshire3D Logo"
                width={120} // Keep dimensions for now
                height={40}
                className="object-contain"
                priority
                unoptimized
              />
            </Link>
          </div>

          {/* Center: Navigation Links (optional) */}
          <div className="hidden md:flex md:space-x-8">
            <Link
              href="/"
              className="text-muted-foreground hover:text-foreground inline-flex items-center px-1 pt-1 text-sm font-medium"
            >
              Dashboard
            </Link>
            <Link
              href="/orders"
              className="text-muted-foreground hover:text-foreground inline-flex items-center px-1 pt-1 text-sm font-medium"
            >
              Orders
            </Link>
            <Link
              href="/print-queue"
              className="text-muted-foreground hover:text-foreground inline-flex items-center px-1 pt-1 text-sm font-medium"
            >
              Print Queue
            </Link>
            {/* Add other links as needed */}
          </div>

          {/* Right side: Auth Status */}
          <div className="flex items-center">
            {isLoggedIn ? (
              <div className="flex items-center space-x-4">
                <span className="text-sm text-muted-foreground">{userEmail}</span>
                <LogoutButton />
              </div>
            ) : (
              <Link href="/login">
                <Button variant="outline" size="sm">
                  Login
                </Button>
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
