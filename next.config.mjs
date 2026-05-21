import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Pin Turbopack's workspace root to this project. Without this, Next picks
  // whichever package-lock.json it finds first walking up — which on Wes's
  // machine is C:\Users\default.DESKTOP-ON29PVN\package-lock.json, so Tailwind
  // ends up scanning the wrong file tree and silently drops utility classes
  // (px-10, sm:px-10, lg:px-16, xl:px-24 …) that only the project uses.
  turbopack: {
    root: __dirname,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '5mb',
    },
  },
  // Don't try to bundle the Phase 1 PDF renderer's native deps for the server build
  serverExternalPackages: ['@cantoo/pdf-lib', 'pdf-to-img'],
};

export default nextConfig;
