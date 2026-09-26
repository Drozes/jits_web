/**
 * Arena matches the athlete deliberately left, so Home's "Resume your match"
 * card does not offer one of them again (jits-jitg, the web counterpart of
 * mobile's in-process `getLeftMatchIds()` in `apps/mobile/lib/arena/arena-store.ts`).
 *
 * "Left" means the match route was open and the athlete navigated away from it
 * inside the app. Closing or reloading the tab on the match screen is not
 * leaving, just as a kill is not on mobile: that is the case Resume exists for.
 *
 * Kept in a session cookie (no expiry) so the server-rendered Home can pass it
 * to `getMyActiveMatch` as `excludeMatchIds`. The value is
 * `<athleteId>:<id>,<id>`; a cookie written for another athlete is ignored.
 * Only pending matches are excluded by the query, as on mobile.
 */
export const LEFT_MATCHES_COOKIE = "elo-left-matches";

/** At most this many ids are kept (newest last); the cookie stays tiny. */
export const LEFT_MATCHES_MAX = 20;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ARENA_MATCH_PATH = /^\/arena\/match\/([^/?#]+)/;

/** The Arena match id in `pathname`, or null when it is not a match route. */
export function arenaMatchIdFromPath(pathname: string | null | undefined): string | null {
  const id = pathname?.match(ARENA_MATCH_PATH)?.[1];
  return id && UUID.test(id) ? id : null;
}

/** The left match ids in a cookie value, for `athleteId` only. */
export function parseLeftMatches(value: string | undefined, athleteId: string): string[] {
  if (!value) return [];
  const decoded = safeDecode(value);
  const sep = decoded.indexOf(":");
  if (sep < 0 || decoded.slice(0, sep) !== athleteId) return [];
  return decoded
    .slice(sep + 1)
    .split(",")
    .filter((id) => UUID.test(id));
}

/** Remember that the athlete left `matchId` (client only, best effort). */
export function rememberLeftMatch(athleteId: string, matchId: string): void {
  if (!UUID.test(matchId)) return;
  try {
    const current = readCookie(document.cookie);
    const ids = parseLeftMatches(current, athleteId).filter((id) => id !== matchId);
    ids.push(matchId);
    const value = encodeURIComponent(`${athleteId}:${ids.slice(-LEFT_MATCHES_MAX).join(",")}`);
    document.cookie = `${LEFT_MATCHES_COOKIE}=${value}; path=/; SameSite=Lax`;
  } catch {
    // Best effort: without it Resume may offer a match the athlete left.
  }
}

function readCookie(cookieHeader: string): string | undefined {
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === LEFT_MATCHES_COOKIE) return rest.join("=");
  }
  return undefined;
}

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return "";
  }
}
