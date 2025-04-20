/** @type {import('next').NextConfig} */
const nextConfig = {
  // Build process settings
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Vercel-optimized settings
  swcMinify: true,
  poweredByHeader: false,
  // Image optimization with automatic domains
  images: {
    domains: ['y3dhub-app.vercel.app'],
    formats: ['image/avif', 'image/webp'],
  },
};

module.exports = nextConfig;
