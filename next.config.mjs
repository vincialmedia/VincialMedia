import siteRewrites from './site-rewrites.mjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
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
