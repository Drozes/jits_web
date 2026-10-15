import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/legal-document";
import { TERMS_EN } from "@jits/shared/legal";

export const metadata: Metadata = {
  title: "Terms of Service | ELO RATED",
  description: "ELO RATED Terms of Service",
  alternates: {
    canonical: "/terms",
    languages: { en: "/terms", fr: "/terms/fr" },
  },
};

/** Public, static: the repo-root TERMS.md (bundled into @jits/shared/legal by npm run legal:sync). */
export default function TermsPage() {
  return (
    <LegalDocument markdown={TERMS_EN.markdown} doc="terms" alternate={{ href: "/terms/fr", label: "Français", lang: "fr" }} />
  );
}
