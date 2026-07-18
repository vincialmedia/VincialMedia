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
      {
        source: '/workout',
        destination: '/workout/index.html',
      },
    ];
  },
};

export default nextConfig;
