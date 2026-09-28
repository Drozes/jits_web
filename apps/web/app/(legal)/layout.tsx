import Link from "next/link";

/**
 * Public legal pages (/terms, /privacy; jits-s6mi.7). Signed-out visitors,
 * store reviewers and Meta's Live-mode checker must reach them, so both
 * paths are in the proxy's public list (lib/supabase/public-paths.ts).
 */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-svh bg-background">
      <header className="border-b border-border px-4 py-4">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <Link href="/" className="font-display text-2xl tracking-wide text-foreground">
            ELO RATED
          </Link>
          <nav className="flex gap-4 font-heading text-xs uppercase tracking-wider text-muted-foreground">
            <Link href="/terms" className="hover:text-foreground">
              Terms
            </Link>
            <Link href="/privacy" className="hover:text-foreground">
              Privacy
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-8">{children}</main>
    </div>
  );
}
