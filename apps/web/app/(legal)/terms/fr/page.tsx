import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/legal-document";
import { TERMS_FR } from "@jits/shared/legal";

export const metadata: Metadata = {
  title: "Conditions d'utilisation | ELO RATED",
  description: "Conditions d'utilisation d'ELO RATED",
  alternates: {
    canonical: "/terms/fr",
    languages: { en: "/terms", fr: "/terms/fr" },
  },
};

/** Public, static: the repo-root TERMS.fr.md (bundled into @jits/shared/legal by npm run legal:sync). */
export default function TermsFrPage() {
  return (
    <LegalDocument
      markdown={TERMS_FR.markdown} doc="terms"
      lang="fr"
      alternate={{ href: "/terms", label: "English", lang: "en" }}
    />
  );
}
