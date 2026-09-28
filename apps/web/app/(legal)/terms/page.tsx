import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/legal-document";
import { TERMS_MARKDOWN } from "@/lib/legal/documents.generated";

export const metadata: Metadata = {
  title: "Terms of Service | ELO RATED",
  description: "ELO RATED Terms of Service",
};

/** Public, static: the repo-root TERMS.md (bundled by scripts/sync-legal-docs.mjs). */
export default function TermsPage() {
  return <LegalDocument markdown={TERMS_MARKDOWN} />;
}
