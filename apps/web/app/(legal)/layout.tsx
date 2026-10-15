import type { Metadata } from "next";
import Link from "next/link";
import { StoreBadges } from "@/components/app-links/store-badges";
import { LegalNav } from "@/components/legal/legal-nav";
import { publicSiteOrigin } from "@/lib/invites/site-origin";

/**
 * The pages' canonical and hreflang links must resolve on the stable public
 * host, never the root layout's per-deployment VERCEL_URL (it sits behind
 * Deployment Protection). Each page's relative `alternates` resolve against it.
 */
export function generateMetadata(): Metadata {
  return { metadataBase: new URL(publicSiteOrigin()) };
}

/**
 * Public legal pages (/terms, /privacy and the French /terms/fr,
 * /privacy/fr; jits-s6mi.7). Signed-out visitors, store reviewers and Meta's
 * Live-mode checker must reach them, so the paths are in the proxy's public
 * list (lib/supabase/public-paths.ts). The header nav follows the page's
 * language (components/legal/legal-nav.tsx).
 */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-svh bg-background">
      <header className="border-b border-border px-4 py-4">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <Link href="/" className="font-display text-2xl tracking-wide text-foreground">
            ELO RATED
          </Link>
          <LegalNav />
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-8">{children}</main>
      <footer className="border-t border-border px-4 py-6">
        <div className="mx-auto max-w-2xl">
          <StoreBadges size="sm" heading="Get the app" />
        </div>
      </footer>
    </div>
  );
}
