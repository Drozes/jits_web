import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/legal-document";
import { PRIVACY_MARKDOWN } from "@/lib/legal/documents.generated";

export const metadata: Metadata = {
  title: "Privacy Policy | ELO RATED",
  description: "ELO RATED Privacy Policy",
};

/** Public, static: the repo-root PRIVACY_POLICY.md (bundled by scripts/sync-legal-docs.mjs). */
export default function PrivacyPage() {
  return <LegalDocument markdown={PRIVACY_MARKDOWN} />;
}
