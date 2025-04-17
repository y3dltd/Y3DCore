import Image from 'next/image'; // Import the Image component
import Link from 'next/link';

import { getCurrentUser } from '@/lib/auth';

import LogoutButton from './logout-button'; // Import the client component
import { Button } from '../ui/button';

// Make Navbar an async component to fetch user server-side
export default async function Navbar() {
  const user = await getCurrentUser();

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
            {user ? (
              <div className="flex items-center space-x-4">
                <span className="text-sm text-muted-foreground">{user.email}</span>
                <LogoutButton /> {/* Use the client component for logout */}
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
