import type { MetadataRoute } from "next";

/** Never disallow /c/: Twitterbot obeys robots.txt for invite card images (spec P8). */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/auth/"] },
  };
}
