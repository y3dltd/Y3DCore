// External imports
import { Inter } from 'next/font/google';

// Internal imports (alphabetized)
import SessionProviderWrapper from '@/app/SessionProviderWrapper';
import { Footer } from '@/components/layout/footer';
import Navbar from '@/components/layout/navbar';
import NextUIWrapper from '@/components/layout/NextUIWrapper';
import { cn } from '@/lib/utils';

// Parent imports
import '../styles/color-badges.css';

// Sibling imports
import './globals.css';

// Type imports
import type { Metadata } from 'next';

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
        {/* Wrap content with SessionProvider */}
        <SessionProviderWrapper>
          <NextUIWrapper>
            <Navbar />
            <main className="flex-grow px-4 py-4">{children}</main>
            <Footer />
          </NextUIWrapper>
        </SessionProviderWrapper>
      </body>
    </html>
  );
}
