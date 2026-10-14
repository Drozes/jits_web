import type { Href } from "expo-router";
import type { LegalDocId, LegalLang } from "@jits/shared/legal/paths";

/**
 * The native legal modal (`app/legal/[doc].tsx`, jits-rog5.8). It sits on the
 * root stack, outside `(app)`, so it opens before sign-in too (login, signup,
 * profile setup, invite setup) as well as from Settings. `section` opens it
 * at a numbered section ("5", "24.3"; jits-rog5.10).
 */
export function legalHref(doc: LegalDocId, lang?: LegalLang, section?: string): Href {
  const query = [lang ? `lang=${lang}` : null, section ? `section=${encodeURIComponent(section)}` : null]
    .filter(Boolean)
    .join("&");
  return (query ? `/legal/${doc}?${query}` : `/legal/${doc}`) as Href;
}

/** Short names for the modal header, links and settings rows. */
export const LEGAL_SHORT_TITLE: Record<LegalDocId, Record<LegalLang, string>> = {
  terms: { en: "Terms of Service", fr: "Conditions d'utilisation" },
  privacy: { en: "Privacy Policy", fr: "Politique de confidentialité" },
};

/** The header's document switch (jits-rog5.10): mixed case so "Confidentialité" fits at 320pt. */
export const LEGAL_SWITCH_LABEL: Record<LegalDocId, Record<LegalLang, string>> = {
  terms: { en: "Terms", fr: "Conditions" },
  privacy: { en: "Privacy", fr: "Confidentialité" },
};

/** The Contents button and panel title. */
export const LEGAL_CONTENTS_LABEL: Record<LegalLang, string> = { en: "Contents", fr: "Sommaire" };

/** The close button's label. */
export const LEGAL_CLOSE_LABEL: Record<LegalLang, string> = { en: "Close", fr: "Fermer" };

/**
 * The agreement checkbox's label (profile setup, invite setup): it names the
 * waiver and the Privacy Policy, not just "the terms". One checkbox for now;
 * the separate Privacy acknowledgement and version recording are jits-rog5.2.
 */
export const LEGAL_AGREE_LABEL =
  "I agree to the Terms of Service, including the Assumption of Risk, Waiver and Release of Liability in Section 5, and I have read the Privacy Policy.";
