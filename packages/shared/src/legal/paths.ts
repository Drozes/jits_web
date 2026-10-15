/**
 * `@jits/shared/legal/paths`: where the legal documents live on the web and
 * the id / language guards, with NO document text. Client components that
 * only link to the documents (the web /eua form, the web help page, the
 * native legal route helpers) import this, so they never pull the about 290 KB of
 * bundled Markdown from `@jits/shared/legal`.
 */
import type { LegalDocId, LegalLang } from "./types";

export type { LegalDocId, LegalLang } from "./types";

export const LEGAL_DOC_IDS: readonly LegalDocId[] = ["terms", "privacy"];
export const LEGAL_LANGS: readonly LegalLang[] = ["en", "fr"];

/** Where the web app serves each document (apps/web/app/(legal)/). */
export const LEGAL_WEB_PATHS: Record<LegalDocId, Record<LegalLang, string>> = {
  terms: { en: "/terms", fr: "/terms/fr" },
  privacy: { en: "/privacy", fr: "/privacy/fr" },
};

export function isLegalDocId(value: unknown): value is LegalDocId {
  return value === "terms" || value === "privacy";
}

export function isLegalLang(value: unknown): value is LegalLang {
  return value === "en" || value === "fr";
}
