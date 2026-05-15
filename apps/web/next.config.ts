import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  env: {
    NEXT_PUBLIC_BUILD_ID: Date.now().toString(),
  },
  // Anchor to the config file's directory so this stays correct regardless
  // of the dev server's cwd. `path.resolve(".", ...)` was CWD-relative and
  // could resolve to a directory missing the hoisted `next` package, putting
  // Turbopack into a panic loop ("Next.js package not found") that surfaced
  // as constant browser reloads.
  turbopack: { root: path.join(__dirname, "..", "..") },
};

export default nextConfig;
