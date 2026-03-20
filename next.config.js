/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: ['localhost:3000'],
    },
  },
  experimental: {
    // Allow pdf-parse and xlsx to run in API routes (Node.js-only packages)
    serverComponentsExternalPackages: ['pdf-parse', 'xlsx'],
  },
};

module.exports = nextConfig;
