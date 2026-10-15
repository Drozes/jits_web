import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/legal-document";
import { PRIVACY_FR } from "@jits/shared/legal";

export const metadata: Metadata = {
  title: "Politique de confidentialité | ELO RATED",
  description: "Politique de confidentialité d'ELO RATED",
  alternates: {
    canonical: "/privacy/fr",
    languages: { en: "/privacy", fr: "/privacy/fr" },
  },
};

/** Public, static: the repo-root PRIVACY_POLICY.fr.md (bundled into @jits/shared/legal by npm run legal:sync). */
export default function PrivacyFrPage() {
  return (
    <LegalDocument
      markdown={PRIVACY_FR.markdown} doc="privacy"
      lang="fr"
      alternate={{ href: "/privacy", label: "English", lang: "en" }}
    />
  );
}
