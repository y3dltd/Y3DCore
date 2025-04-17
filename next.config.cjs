/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */
  typescript: {
    // !! WARN !!
    // Dangerously allow production builds to successfully complete even if
    // your project has type errors.
    // !! WARN !!
    // ignoreBuildErrors: true,
  },
  eslint: {
    // Allow builds to complete even with ESLint warnings
    // This is necessary because Next.js treats warnings as errors by default
    ignoreDuringBuilds: true,
  },
  // Optimize builds with persistent caching
  experimental: {
    // Incremental cache persists between builds
    incrementalCacheHandlerPath: require.resolve('./node_modules/netlify-plugin-cache/dist/incrementalHandler.js'),
  },
  // Minimize image optimization overhead in builds
  images: {
    minimumCacheTTL: 60,
  },
  // Reduce build output size
  poweredByHeader: false,
  // Improve compression
  compress: true,
};

module.exports = nextConfig;
