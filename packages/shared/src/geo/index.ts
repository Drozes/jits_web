import { NA_CITIES } from "./na-cities";

export { NA_CITIES };

/**
 * Case-insensitive autocomplete over the bundled US + Canada city list
 * (`"City, Region, Country"` labels). Results are ranked in three tiers so the
 * obvious city surfaces even when the query is not the first word:
 *   1. the whole label starts with the query ("aus" -> "Austin, ...")
 *   2. a later word starts with the query ("vegas" -> "Las Vegas, ...")
 *   3. the query appears anywhere as a substring
 * Returns at most `limit` labels; an empty/whitespace query returns `[]` so
 * callers can show their own suggestions.
 *
 * The dataset is ~21k entries, so a full scan per keystroke is sub-millisecond.
 * Consumers on mobile should still `import()` this module lazily (only when the
 * picker mounts) to keep it off the cold-start path.
 */
export function searchCities(query: string, limit = 20): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const starts: string[] = [];
  const word: string[] = [];
  const sub: string[] = [];
  for (const city of NA_CITIES) {
    const lower = city.toLowerCase();
    if (lower.startsWith(q)) {
      if (starts.length < limit) starts.push(city);
      continue;
    }
    const idx = lower.indexOf(q);
    if (idx === -1) continue;
    if (lower[idx - 1] === " ") {
      if (word.length < limit) word.push(city);
    } else if (sub.length < limit) {
      sub.push(city);
    }
  }
  return [...starts, ...word, ...sub].slice(0, limit);
}
