import { NA_CITIES } from "./na-cities";

export { NA_CITIES };

/**
 * Curated major US + Canada metros, keyed by the `"City, Region"` prefix of a
 * label. The offline dataset carries no population data, so without a nudge a
 * query like "austin" or "san" surfaces alphabetically-first small towns ahead
 * of the metro the user almost certainly means. Matches whose `"City, Region"`
 * is in this set float to the front of their match tier. A key that does not
 * exist in the dataset simply never boosts anything, so the list is safe to
 * keep loose; it only needs the places people actually type.
 */
const MAJOR_METROS: ReadonlySet<string> = new Set([
  // USA (keys are the dataset's "City, Region"; "New York City" is its label)
  "New York City, NY", "Los Angeles, CA", "Chicago, IL", "Houston, TX",
  "Phoenix, AZ", "Philadelphia, PA", "San Antonio, TX", "San Diego, CA",
  "Dallas, TX", "San Jose, CA", "Austin, TX", "Jacksonville, FL",
  "Fort Worth, TX", "Columbus, OH", "Charlotte, NC", "San Francisco, CA",
  "Indianapolis, IN", "Seattle, WA", "Denver, CO", "Washington, DC",
  "Boston, MA", "El Paso, TX", "Nashville, TN", "Detroit, MI",
  "Oklahoma City, OK", "Portland, OR", "Las Vegas, NV", "Memphis, TN",
  "Louisville, KY", "Baltimore, MD", "Milwaukee, WI", "Albuquerque, NM",
  "Tucson, AZ", "Fresno, CA", "Sacramento, CA", "Kansas City, MO",
  "Mesa, AZ", "Atlanta, GA", "Omaha, NE", "Colorado Springs, CO",
  "Raleigh, NC", "Miami, FL", "Long Beach, CA", "Virginia Beach, VA",
  "Oakland, CA", "Minneapolis, MN", "Tulsa, OK", "Tampa, FL",
  "Arlington, TX", "New Orleans, LA", "Cleveland, OH", "Pittsburgh, PA",
  "Cincinnati, OH", "Orlando, FL", "Salt Lake City, UT", "St. Louis, MO",
  // Canada
  "Toronto, ON", "Montréal, QC", "Montreal, QC", "Calgary, AB",
  "Ottawa, ON", "Edmonton, AB", "Winnipeg, MB", "Vancouver, BC",
  "Québec, QC", "Quebec, QC", "Hamilton, ON", "Kitchener, ON",
  "London, ON", "Victoria, BC", "Halifax, NS", "Mississauga, ON",
  "Brampton, ON", "Surrey, BC", "Laval, QC", "Markham, ON",
  "Gatineau, QC", "Saskatoon, SK", "Regina, SK", "Burnaby, BC",
]);

/** `"Austin, TX, USA"` -> `"Austin, TX"`; the key used against MAJOR_METROS. */
function cityRegionKey(label: string): string {
  const parts = label.split(", ");
  return parts.length >= 2 ? `${parts[0]}, ${parts[1]}` : parts[0];
}

/**
 * Order two same-tier matches: curated major metros first, then the shorter
 * city name (so "Austin" beats "Austintown"), then alphabetical.
 */
function compareMatches(a: string, b: string): number {
  const ra = MAJOR_METROS.has(cityRegionKey(a)) ? 0 : 1;
  const rb = MAJOR_METROS.has(cityRegionKey(b)) ? 0 : 1;
  if (ra !== rb) return ra - rb;
  const ca = a.slice(0, a.indexOf(","));
  const cb = b.slice(0, b.indexOf(","));
  if (ca.length !== cb.length) return ca.length - cb.length;
  return a.localeCompare(b);
}

/**
 * Case-insensitive autocomplete over the bundled US + Canada city list
 * (`"City, Region, Country"` labels). Matches are bucketed into three tiers so
 * the obvious city surfaces even when the query is not the first word:
 *   1. the whole label starts with the query ("aus" -> "Austin, ...")
 *   2. a later word starts with the query ("vegas" -> "Las Vegas, ...")
 *   3. the query appears anywhere as a substring
 * and each tier is ordered by {@link compareMatches} so a major metro wins over
 * a same-prefix small town. Returns at most `limit` labels.
 *
 * Queries shorter than 2 characters return `[]` (a single letter only yields an
 * alphabetical slice, never what the user wants), so callers can fall back to
 * their own suggestions until the user has typed enough to disambiguate.
 *
 * The dataset is ~18k entries, so a full scan + tier sort per keystroke stays
 * well under a frame. Consumers on mobile should still `import()` this module
 * lazily (only when the picker mounts) to keep it off the cold-start path.
 */
export function searchCities(query: string, limit = 20): string[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const starts: string[] = [];
  const word: string[] = [];
  const sub: string[] = [];
  for (const city of NA_CITIES) {
    const lower = city.toLowerCase();
    if (lower.startsWith(q)) {
      starts.push(city);
      continue;
    }
    // Match only within the "City, Region" portion, never the trailing country.
    // Otherwise "sa"/"us" match ", USA" (and "an" matches "Canada") on nearly
    // every row, flooding the substring tier and making the per-keystroke sort
    // an order of magnitude slower for no useful results.
    const countryAt = lower.lastIndexOf(", ");
    const idx = lower.indexOf(q);
    if (idx === -1 || (countryAt > 0 && idx >= countryAt)) continue;
    const prev = lower[idx - 1];
    if (prev === " " || prev === ",") word.push(city);
    else sub.push(city);
  }
  starts.sort(compareMatches);
  word.sort(compareMatches);
  sub.sort(compareMatches);
  return [...starts, ...word, ...sub].slice(0, limit);
}
