/** The two legal documents. */
export type LegalDocId = "terms" | "privacy";

/** The languages each document is published in (French is a Quebec requirement). */
export type LegalLang = "en" | "fr";

/** One bundled legal document in one language (see documents.generated.ts). */
export interface LegalDocumentData {
  /** The repo-root Markdown file it was bundled from. */
  source: string;
  /** The document's H1, e.g. "ELO RATED Terms of Service". */
  title: string;
  /** As written in the document, e.g. "October 13, 2026" or "13 octobre 2026". */
  effectiveDate: string;
  /** As written in the document. */
  lastUpdated: string;
  /**
   * The first 12 hex characters of the SHA-256 of `markdown`: changes with
   * any edit to the text, so an acceptance can record exactly what was shown
   * (jits-rog5.2).
   */
  version: string;
  markdown: string;
}
