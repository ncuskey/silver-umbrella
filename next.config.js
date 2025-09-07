const withBundleAnalyzer = require("@next/bundle-analyzer")({ enabled: process.env.ANALYZE === "1" });
const nextConfig = withBundleAnalyzer({
  output: 'standalone',
  images: { unoptimized: true },
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
