/** @type {import('next').NextConfig} */
const nextConfig = {
  // Core settings for build process
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Server-side rendering settings
  distDir: ".next",
  // Proper trailing slash handling
  trailingSlash: true,
  // Performance settings
  poweredByHeader: false,
  compress: true,
  // Image optimization
  images: {
    domains: ['y3dhub-app.windsurf.build'],
    minimumCacheTTL: 60,
  },
};

module.exports = nextConfig;
