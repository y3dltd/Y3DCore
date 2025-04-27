'use client';

import { Dropdown, DropdownTrigger, DropdownMenu, DropdownItem } from '@nextui-org/react'; // Import NextUI Dropdown
import Image from 'next/image'; // Import the Image component
import Link from 'next/link';
import { useSession } from 'next-auth/react'; // Import useSession
// Remove unused imports
// import { useRouter } from 'next/navigation';
// import { useEffect, useState } from 'react';

// Remove unused auth-client import
// import { checkAuthStatus, hasSessionCookie } from '@/lib/auth-client';

import LogoutButton from './logout-button'; // Import the client component
import { Button } from '../ui/button';

// Mocked Navbar - Assumes user is always logged in
export default function Navbar() {
  const { data: session, status } = useSession(); // Use the hook
  const isLoggedIn = status === 'authenticated';
  const isLoading = status === 'loading';
  const userEmail = session?.user?.email; // Get email from session data

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
            <Dropdown>
              <DropdownTrigger>
                {/* Use a standard Button variant instead of invalid props */}
                <Button variant="ghost" className="text-muted-foreground hover:text-foreground">
                  AI Tools
                </Button>
              </DropdownTrigger>
              <DropdownMenu
                aria-label="AI Tools"
                disallowEmptySelection
                selectionMode="single"
                className="bg-popover text-popover-foreground shadow-md rounded-md border border-border"
              >
                {[
                  {
                    href: '/ai/playground',
                    label: 'AI Playground',
                  },
                  {
                    href: '/ai/reports',
                    label: 'AI Reports',
                  },
                  {
                    href: '/ai/history',
                    label: 'AI History',
                  },
                  {
                    href: '/ai/planner',
                    label: 'Planner',
                  },
                ].map((item) => (
                  <DropdownItem
                    key={item.href}
                    textValue={item.label} // Important for accessibility and server-side rendering
                  >
                    <Link href={item.href} className="w-full h-full block">
                      {item.label}
                    </Link>
                  </DropdownItem>
                ))}
              </DropdownMenu>
            </Dropdown>
            {/* Add other links as needed */}
          </div>

          {/* Right side: Auth Status */}
          <div className="flex items-center">
            {isLoading ? (
              // Optional: Show a loading indicator
              <span className="text-sm text-muted-foreground">Loading...</span>
            ) : isLoggedIn ? (
              <div className="flex items-center space-x-4">
                <span className="text-sm text-muted-foreground">
                  {userEmail || 'User'} {/* Fallback if email is missing */}
                </span>
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
