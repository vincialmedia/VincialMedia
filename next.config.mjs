import siteRewrites from './site-rewrites.mjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    // only local images are used; an open pattern turned /_next/image into a proxy for any site
    remotePatterns: [],
  },
  allowedDevOrigins: ['*.daytona.work'],
  async rewrites() {
    return [
      // the new agency site: pre-rendered HTML in public/site, served under clean URLs
      ...siteRewrites,
      {
        source: '/workout',
        destination: '/workout/index.html',
      },
      {
        source: '/secret-game',
        destination: '/secret-game/index.html',
      },
    ];
  },
};

export default nextConfig;
