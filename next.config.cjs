/** @type {import('next').NextConfig} */
const nextConfig = {
  // Minimal configuration
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;
