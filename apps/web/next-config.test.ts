// @vitest-environment node
import { describe, expect, it } from "vitest";
import nextConfig from "./next.config";

describe("next.config headers", () => {
  it("caches the versioned landing videos for a year, immutable, and keeps the other rules", async () => {
    const rules = (await nextConfig.headers?.()) ?? [];
    const video = rules.find((r) => r.source === "/landing/videos/:file*");
    expect(video?.headers).toEqual([{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }]);
    expect(rules.find((r) => r.source === "/c/:token")?.headers).toEqual([
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "Cache-Control", value: "private, no-store" },
      { key: "X-Robots-Tag", value: "noindex" },
    ]);
    expect(rules.find((r) => r.source === "/.well-known/apple-app-site-association")?.headers).toEqual([
      { key: "Content-Type", value: "application/json" },
    ]);
    expect(rules).toHaveLength(3);
  });
});
