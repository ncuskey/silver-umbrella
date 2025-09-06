const withBundleAnalyzer = require("@next/bundle-analyzer")({ enabled: process.env.ANALYZE === "1" });
const nextConfig = withBundleAnalyzer({
  output: 'standalone',
  images: { unoptimized: true },
  async headers() {
    return [{ source: "/dicts/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] }];
  },
});
module.exports = nextConfig;
