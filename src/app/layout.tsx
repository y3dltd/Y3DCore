import type { Metadata } from 'next';
import { Inter } from 'next/font/google';

import { Footer } from '@/components/layout/footer'; // Import Footer
import Navbar from '@/components/layout/navbar';
import { cn } from '@/lib/utils'; // Import cn utility
import '../styles/color-badges.css';
import './globals.css';

// Initialize Inter font
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter', // Optionally define a CSS variable
});

export const metadata: Metadata = {
  title: 'Y3D Hub GL',
  description: 'Order Management and Processing Hub',
};

// Force runtime rendering for all pages, as data is dynamic and may rely on server-only resources
export const dynamic = 'force-dynamic';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // Remove suppressHydrationWarning
    <html lang="en" className="dark">
      <head>
        {/* Metadata will be injected here */}
        <link rel="icon" href="/fav/favicon.ico" sizes="any" />
        <link rel="icon" type="image/png" sizes="32x32" href="/fav/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/fav/favicon-16x16.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/fav/apple-icon-180x180.png" />
        <link rel="manifest" href="/manifest.json" />
        {/* Add other sizes/types as needed from your public/fav directory */}
      </head>
      {/* Apply Inter font class using its variable or className */}
      <body
        className={cn(
          inter.variable, // Use variable for better flexibility
          'font-sans antialiased flex flex-col min-h-screen'
        )}
      >
        <Navbar />
        <main className="flex-grow px-4 py-4">{children}</main>
        <Footer /> {/* Add Footer here */}
      </body>
    </html>
  );
}
