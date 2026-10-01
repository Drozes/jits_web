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
  // The invite OG card reads its fonts from disk at request time.
  outputFileTracingIncludes: {
    "/c/**": ["./lib/invites/fonts/**"],
  },
  async headers() {
    return [
      {
        // Invite landing (016 contract 6): the token is in the path, so it
        // must never leak via Referer, be cached by a shared cache, or be
        // indexed. The OG image sub-route is excluded (crawlers fetch it).
        source: "/c/:token",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "private, no-store" },
          { key: "X-Robots-Tag", value: "noindex" },
        ],
      },
      {
        // Apple fetches this extensionless file and requires JSON.
        source: "/.well-known/apple-app-site-association",
        headers: [{ key: "Content-Type", value: "application/json" }],
      },
    ];
  },
};

export default nextConfig;
