import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/legal-document";
import { PRIVACY_EN } from "@jits/shared/legal";

export const metadata: Metadata = {
  title: "Privacy Policy | ELO RATED",
  description: "ELO RATED Privacy Policy",
  alternates: {
    canonical: "/privacy",
    languages: { en: "/privacy", fr: "/privacy/fr" },
  },
};

/** Public, static: the repo-root PRIVACY_POLICY.md (bundled into @jits/shared/legal by npm run legal:sync). */
export default function PrivacyPage() {
  return (
    <LegalDocument markdown={PRIVACY_EN.markdown} doc="privacy" alternate={{ href: "/privacy/fr", label: "Français", lang: "fr" }} />
  );
}
