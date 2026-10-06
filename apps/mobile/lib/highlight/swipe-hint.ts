import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * The viewer's swipe hint C-V1 ("Swipe up for the next one", specs/matches-tab
 * section 8): once per install, never with fewer than 2 pages, gone for good
 * after the first swipe or 4 s. The flag lives in AsyncStorage so it survives
 * restarts; an unreadable store reads as "already shown" (a missed hint costs
 * nothing, a hint on every launch would nag).
 */
export const SWIPE_HINT_STORAGE_KEY = "reels:swipe-hint:v1";
/** The hint hides itself after this long, and stays marked shown. */
export const SWIPE_HINT_TIMEOUT_MS = 4_000;
export const SWIPE_HINT_COPY = "Swipe up for the next one";

let shown: boolean | null = null;
let reading: Promise<boolean> | null = null;

/** True when the hint was already shown on this install. */
export function hasSeenSwipeHint(): Promise<boolean> {
  if (shown !== null) return Promise.resolve(shown);
  if (!reading) {
    reading = AsyncStorage.getItem(SWIPE_HINT_STORAGE_KEY)
      .then((raw) => raw !== null)
      .catch(() => true)
      .then((value) => {
        // A mark made while the read was in flight wins.
        if (shown === null) shown = value;
        return shown;
      });
  }
  return reading;
}

/** Whether the pager should show the hint now (2+ pages and never shown). */
export async function shouldShowSwipeHint(pageCount: number): Promise<boolean> {
  if (pageCount < 2) return false;
  return !(await hasSeenSwipeHint());
}

/** Records the hint as shown (call when it appears: a swipe or the timeout then only hides it). */
export function markSwipeHintShown(): void {
  if (shown === true) return;
  shown = true;
  void AsyncStorage.setItem(SWIPE_HINT_STORAGE_KEY, "1").catch(() => undefined);
}

/** Test-only. */
export function __resetSwipeHint(): void {
  shown = null;
  reading = null;
}
