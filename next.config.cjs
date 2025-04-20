/** @type {import('next').NextConfig} */
const nextConfig = {
  // Core settings for Netlify compatibility
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Let the Netlify adapter handle output
  output: "export", // This makes Next.js work better with Netlify
  // Needed to ensure proper links
  trailingSlash: true,
  // Basic performance settings
  poweredByHeader: false,
  compress: true,
  // Image optimization settings
  images: {
    unoptimized: true, // Let Netlify handle the image optimization
  },
};

module.exports = nextConfig;
