'use client';

import Image from 'next/image'; // Import the Image component
import Link from 'next/link';
// Remove unused imports
// import { useRouter } from 'next/navigation';
// import { useEffect, useState } from 'react';

// Remove unused auth-client import
// import { checkAuthStatus, hasSessionCookie } from '@/lib/auth-client';

import { Button } from '../ui/button';
import LogoutButton from './logout-button'; // Import the client component

// Mocked Navbar - Assumes user is always logged in
export default function Navbar() {
  // Assume always logged in with mock user details
  const isLoggedIn = true;
  const userEmail = 'mock@example.com'; // Directly use mock user email

  // Removed useEffect and state management related to auth checking

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
            {/* Always show logged-in state */}
            {isLoggedIn ? (
              <div className="flex items-center space-x-4">
                <span className="text-sm text-muted-foreground">{userEmail}</span>
                <LogoutButton />
              </div>
            ) : (
              // This part should ideally never be reached now
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
