import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  env: {
    NEXT_PUBLIC_BUILD_ID: Date.now().toString(),
  },
  // Resolve from workspace root (two levels up from apps/web) so Turbopack
  // can find hoisted dependencies like `next`.
  turbopack: { root: path.resolve(".", "..", "..") },
};

export default nextConfig;
