const path = require("path");
const withBundleAnalyzer = require("@next/bundle-analyzer")({ enabled: process.env.ANALYZE === "1" });
const isProd = process.env.NODE_ENV === "production";

const nextConfig = withBundleAnalyzer({
  output: 'standalone',
  assetPrefix: isProd && process.env.ASSET_PREFIX ? process.env.ASSET_PREFIX : '',
  images: { unoptimized: true },
  // Force correct workspace root to avoid Next.js mis-detecting parent lockfiles
  outputFileTracingRoot: __dirname,
  // Memory optimization settings
  experimental: {
    // Reduce memory usage during build
    workerThreads: false,
    cpus: 1
  },
  // Optimize webpack for memory usage
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Reduce memory usage for client builds
      config.optimization.splitChunks = {
        chunks: 'all',
        cacheGroups: {
          default: {
            minChunks: 2,
            priority: -20,
            reuseExistingChunk: true,
          },
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name: 'vendors',
            priority: -10,
            chunks: 'all',
          },
        },
      };
    }
    return config;
  },
});
module.exports = nextConfig;
