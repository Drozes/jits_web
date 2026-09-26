/**
 * The Arena challenge I last accepted and have not entered yet, persisted so
 * a reload between accept and start still knows it (jits-itjn, the web port
 * of mobile's AsyncStorage record in `apps/mobile/lib/arena/use-arena-challenge.ts`).
 * One record per athlete, `{ challengeId, at }`. Best effort: storage can be
 * unavailable (private mode, blocked site data) or throw, and every accessor
 * swallows that, so the handshake works the same without it.
 */
export const ACCEPTED_KEY_PREFIX = "elo-rated:arena-accepted:";

export interface AcceptedRecord {
  challengeId: string;
  at: number;
}

export function readAccepted(athleteId: string): AcceptedRecord | null {
  try {
    const raw = window.localStorage.getItem(ACCEPTED_KEY_PREFIX + athleteId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AcceptedRecord>;
    if (typeof parsed.challengeId !== "string" || typeof parsed.at !== "number") {
      return null;
    }
    return { challengeId: parsed.challengeId, at: parsed.at };
  } catch {
    return null;
  }
}

export function writeAccepted(athleteId: string, record: AcceptedRecord): void {
  try {
    window.localStorage.setItem(ACCEPTED_KEY_PREFIX + athleteId, JSON.stringify(record));
  } catch {
    // Best effort.
  }
}

export function clearAccepted(athleteId: string): void {
  try {
    window.localStorage.removeItem(ACCEPTED_KEY_PREFIX + athleteId);
  } catch {
    // Best effort.
  }
}
