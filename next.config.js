/** @type {import('next').NextConfig} */
const nextConfig = {
  // Produce a minimal runtime bundle (no dev deps needed at runtime)
  output: 'standalone',
  // If you don't need next/image optimization, skip pulling sharp binaries
  images: { unoptimized: true },
};

module.exports = nextConfig
