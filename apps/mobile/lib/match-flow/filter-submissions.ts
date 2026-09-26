import type { SubmissionType } from "@jits/shared/types/submission-type";

/** Code of the catch-all submission type (seeded as "Other Submission"). */
export const OTHER_SUBMISSION_CODE = "other";

/** Lowercase and strip diacritics (NFD, then drop combining marks). */
function foldCase(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/**
 * Lowercase, strip diacritics, and drop everything that is not a letter or
 * digit, so "D'Arce", "darce", "North-South" and "north south" compare equal.
 */
export function compactSearchText(s: string): string {
  return foldCase(s).replace(/[^a-z0-9]/g, "");
}

/** First letter of every word: "Rear Naked Choke" -> "rnc". */
function initials(s: string): string {
  return foldCase(s)
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("");
}

/**
 * Filter submission types for the picker search. Case-, punctuation- and
 * spacing-insensitive "match anywhere" on the display name and the code, plus
 * an initials match so shorthand like "rnc" finds "Rear Naked Choke". An empty
 * query returns the list unchanged; source order (sort_order) is preserved.
 */
export function filterSubmissionTypes(
  types: SubmissionType[],
  query: string,
): SubmissionType[] {
  const q = compactSearchText(query);
  if (!q) return types;
  return types.filter(
    (t) =>
      compactSearchText(t.display_name).includes(q) ||
      compactSearchText(t.code).includes(q) ||
      initials(t.display_name).includes(q),
  );
}
