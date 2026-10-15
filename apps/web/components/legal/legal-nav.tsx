"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = {
  en: { lang: "en", terms: { href: "/terms", label: "Terms" }, privacy: { href: "/privacy", label: "Privacy" } },
  fr: {
    lang: "fr",
    terms: { href: "/terms/fr", label: "Conditions" },
    privacy: { href: "/privacy/fr", label: "Confidentialité" },
  },
} as const;

/** The (legal) header links, in the language of the page being read (/terms/fr, /privacy/fr are French). */
export function LegalNav() {
  const nav = usePathname()?.endsWith("/fr") ? NAV.fr : NAV.en;
  return (
    <nav lang={nav.lang} className="flex gap-4 font-heading text-xs uppercase tracking-wider text-muted-foreground">
      <Link href={nav.terms.href} className="hover:text-foreground">
        {nav.terms.label}
      </Link>
      <Link href={nav.privacy.href} className="hover:text-foreground">
        {nav.privacy.label}
      </Link>
    </nav>
  );
}
