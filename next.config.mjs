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
      // the old clinics landing page is gone; its visitors want the AI assistant page
      { source: '/kliniken', destination: '/ki-automation', permanent: true },
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
