const withBundleAnalyzer = require("@next/bundle-analyzer")({ enabled: process.env.ANALYZE === "1" });
const nextConfig = withBundleAnalyzer({
  output: 'standalone',
  images: { unoptimized: true },
});
module.exports = nextConfig;
