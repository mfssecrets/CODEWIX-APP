import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Do NOT set output: "standalone" — @opennextjs/cloudflare handles the build
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,

  // Optimize for edge deployment
  experimental: {
    // Enable server actions externalization for edge runtime
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },

  // Exclude sharp from client bundles — it's not needed on CF Workers
  // and uses native bindings that don't work in edge runtime
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Exclude sharp from server bundle for edge compatibility
      config.externals = config.externals || [];
      if (Array.isArray(config.externals)) {
        config.externals.push("sharp");
      }
    }
    return config;
  },

  // Headers for security and caching
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        source: "/assets/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
