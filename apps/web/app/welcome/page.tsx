import type { Metadata, Viewport } from "next";
import { LandingPage } from "@/components/landing/landing-page";

export const metadata: Metadata = {
  title: { absolute: "ELO RATED: Ranked Jiu-Jitsu" },
  description: "BJJ matches, filmed and rated. Ranked no-gi jiu-jitsu on your phone.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "ELO RATED: Ranked Jiu-Jitsu",
    description: "BJJ matches, filmed and rated.",
    url: "/",
    siteName: "ELO RATED",
    type: "website",
    images: [{ url: "/landing/hero.jpg", width: 1024, height: 1024, alt: "Two grapplers on the mat under one light" }],
  },
  twitter: { card: "summary_large_image", title: "ELO RATED: Ranked Jiu-Jitsu", description: "BJJ matches, filmed and rated." },
};

export const viewport: Viewport = { themeColor: "#0D0F14" };

/**
 * Internal route: the proxy rewrites "/" here while the web app is locked and
 * redirects direct requests for /welcome to "/" (specs/web-landing/spec.md).
 * Static: no cookies, headers, search params or dates, so it prerenders.
 */
export default function WelcomePage() {
  return <LandingPage />;
}
