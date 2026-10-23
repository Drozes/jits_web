/**
 * Device cache for the last-known ELO, so the launch reveal ("The Climb") can
 * roll the odometer up to the user's real rating on cold start instead of the
 * brand default. Best-effort: any read/write failure falls back silently to the
 * default (handled by the caller via SPLASH_REVEAL.DEFAULT_ELO).
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Versioned by rating model: the Rating V9 cutover (jr_be spec 019) replays
 * every rating onto the 1500 scale, so a pre-V9 value ("elo-rated:last-elo",
 * on the old 1000 scale) must never be rolled to on the first launch after
 * the OTA. The old key is simply never read again.
 */
export const ELO_CACHE_KEY = "elo-rated:last-elo:v9";
const KEY = ELO_CACHE_KEY;

/** Last ELO persisted after login, or null if none / unreadable. */
export async function getCachedElo(): Promise<number | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw == null) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/** Persist the athlete's current ELO for the next cold-start reveal. */
export async function setCachedElo(elo: number): Promise<void> {
  try {
    if (!Number.isFinite(elo)) return;
    await AsyncStorage.setItem(KEY, String(Math.round(elo)));
  } catch {
    // best-effort cache; ignore failures
  }
}
