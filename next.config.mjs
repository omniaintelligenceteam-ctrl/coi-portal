/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: {
      bodySizeLimit: '5mb',
    },
  },
  // Don't try to bundle the Phase 1 PDF renderer's native deps for the server build
  serverExternalPackages: ['@cantoo/pdf-lib', 'pdf-to-img'],
};

export default nextConfig;
