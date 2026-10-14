/**
 * `@jits/shared/legal`: the bundled Terms of Service and Privacy Policy
 * (English and French), their metadata, and the tiny Markdown reader both
 * apps render them with (jits-rog5.8).
 *
 * Deliberately NOT re-exported from the root `@jits/shared` index: the four
 * documents are about 290 KB of text, and only the screens that show them
 * should pay for it. Import the named constants (TERMS_EN, ...) where one
 * document is enough so a bundler can drop the rest; `LEGAL_DOCUMENTS` pulls
 * in all four. Code that only links to the documents imports
 * `@jits/shared/legal/paths` instead (no text).
 */
import { PRIVACY_EN, PRIVACY_FR, TERMS_EN, TERMS_FR } from "./documents.generated";
import type { LegalDocId, LegalDocumentData, LegalLang } from "./types";

export type { LegalDocId, LegalDocumentData, LegalLang } from "./types";
export { PRIVACY_EN, PRIVACY_FR, TERMS_EN, TERMS_FR } from "./documents.generated";
export * from "./markdown";
export * from "./references";
export * from "./paths";

export const LEGAL_DOCUMENTS: Record<LegalDocId, Record<LegalLang, LegalDocumentData>> = {
  terms: { en: TERMS_EN, fr: TERMS_FR },
  privacy: { en: PRIVACY_EN, fr: PRIVACY_FR },
};
