import siteRewrites from './site-rewrites.mjs';

// Vercel serves public/*.html without the extension (cleanUrls in vercel.json), and a rewrite to the .html path finds nothing
// there. A local Next server only knows the full file name. So the destination depends on where the build runs.
const cleanUrls = !!process.env.VERCEL;
const sitePages = siteRewrites.map((r) => (cleanUrls ? { ...r, destination: r.destination.replace(/\/index\.html$/, '').replace(/\.html$/, '') } : r));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    // only local images are used; an open pattern turned /_next/image into a proxy for any site
    remotePatterns: [],
  },
  allowedDevOrigins: ['*.daytona.work'],
  async redirects() {
    return [
      // pages of the old clinic-focused site, removed November 2026
      { source: '/kliniken', destination: '/ki-automation', permanent: true },
      { source: '/cerisa', destination: '/ki-automation', permanent: true },
      { source: '/arzthub', destination: '/ki-automation', permanent: true },
      { source: '/drvince', destination: '/', permanent: true },
    ];
  },
  async rewrites() {
    return [
      // the new agency site: pre-rendered HTML in public/site, served under clean URLs
      ...sitePages,
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
