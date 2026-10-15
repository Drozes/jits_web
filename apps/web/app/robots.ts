import type { MetadataRoute } from "next";

/**
 * Never disallow /c/: Twitterbot obeys robots.txt for invite card images
 * (spec P8). /design/ holds stale internal wireframes (public/design/*.html).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/auth/", "/design/"] },
  };
}
