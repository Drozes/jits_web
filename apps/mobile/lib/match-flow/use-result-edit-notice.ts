/**
 * TK-RC3 (timekeeper mode A8, COPY-DECK Round 4): the in-app toast to an
 * athlete whose confirmation an edit reset, "Result changed / {name}
 * corrected the result. Confirm it again.", once per edit.
 *
 * An edit deletes both confirmations and bumps `result_edit_count`
 * (jr_be 024 4.6), so a reset shows as: this athlete's confirmation known at
 * some count, then a later count without it. Known from two places, kept
 * per match and athlete in module scope so they agree and a remount never
 * shows the toast again:
 *  - the confirm step's own successful confirm (`noteResultConfirmed`, at the
 *    count it sent), which covers an edit landing before any read lists it;
 *  - a read that lists the confirmation (`useResultEditNotice`). The match
 *    and its confirmations are two reads, so one that straddles an edit can
 *    list the old confirmation next to the new count: a listing is credited
 *    to the count the previous read had, never to a count that just changed.
 *
 * Once announced, that confirmation is spent: the edit deleted it, so a
 * later edit says nothing more unless the athlete confirmed again (by their
 * own confirm or a read that lists it). A confirm the server refused
 * (RESULT_CHANGED) is never recorded, so it never leads to the toast.
 *
 * The record is also kept on the device (AsyncStorage), so a relaunch keeps
 * it: an athlete who confirmed, then relaunched, opens on the verdict, and
 * the confirm step (where the record is made) never mounts in the new run
 * until an edit brings them back to it (the A8 backward move). The stored
 * record is read once per run, the first time the notice is enabled; an
 * entry older than an hour can never meet an edit (the window is 30 minutes
 * after the result, A24) and is dropped. A spent record is removed there too.
 *
 * A two-athlete match never edits (its count stays 0), so the hook is inert
 * there; the confirm step (`useConfirmResult`) enables it only for an
 * athlete whose result the timekeeper records. It is mounted there, where
 * the wizard brings the athlete back after an edit; the module-scope record
 * survives the confirm, verdict and confirm remounts in between.
 */
import * as React from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { toast } from "@/components/ui/toast";
import { TIMEKEEPER_COPY } from "./timekeeper-copy";

/** The device's copy of the records: `{ [matchId:athleteId]: { count, at } }`. */
export const RESULT_EDIT_NOTICE_STORAGE_KEY = "match-flow:result-edit-confirmations";
/** A stored record this old can never meet an edit (30-minute window, A24). */
const STORED_TTL_MS = 60 * 60 * 1000;

/** Per `${matchId}:${athleteId}`: the highest count the confirmation was known at. */
const confirmedAt = new Map<string, number>();
/** Per `${matchId}:${athleteId}`: when that record was last raised (epoch ms). */
const recordedAt = new Map<string, number>();
/** Per `${matchId}:${athleteId}`: the highest count already announced. */
const announced = new Map<string, number>();
/** This run's one read of the stored records: the keys it added. */
let hydration: Promise<ReadonlySet<string>> | null = null;

const keyOf = (matchId: string, athleteId: string) => `${matchId}:${athleteId}`;

type Stored = Record<string, { count: number; at: number }>;

function parseStored(raw: string | null): Stored {
  try {
    const v: unknown = raw ? JSON.parse(raw) : null;
    return v && typeof v === "object" ? (v as Stored) : {};
  } catch {
    return {};
  }
}

/** Read the stored records once per run, merged under what this run already knows. Never rejects. */
function hydrate(): Promise<ReadonlySet<string>> {
  if (!hydration) {
    hydration = AsyncStorage.getItem(RESULT_EDIT_NOTICE_STORAGE_KEY)
      .then((raw) => {
        const added = new Set<string>();
        const now = Date.now();
        for (const [key, rec] of Object.entries(parseStored(raw))) {
          if (typeof rec?.count !== "number" || typeof rec.at !== "number" || now - rec.at > STORED_TTL_MS) continue;
          // Spent by an edit this run already announced, or known here at the same count or later.
          if ((announced.get(key) ?? -1) > rec.count || (confirmedAt.get(key) ?? -1) >= rec.count) continue;
          confirmedAt.set(key, rec.count);
          recordedAt.set(key, rec.at);
          added.add(key);
        }
        return added as ReadonlySet<string>;
      })
      .catch(() => new Set<string>());
  }
  return hydration;
}

/** Write this run's records (after the read, so it never drops a stored one this run has not seen). */
function persist(): void {
  void hydrate().then(() => {
    const now = Date.now();
    const out: Stored = {};
    for (const [key, count] of confirmedAt) {
      const at = recordedAt.get(key) ?? now;
      if (now - at <= STORED_TTL_MS) out[key] = { count, at };
    }
    return AsyncStorage.setItem(RESULT_EDIT_NOTICE_STORAGE_KEY, JSON.stringify(out)).catch(() => undefined);
  });
}

/** This athlete's confirmation stands at `editCount` (the count their confirm carried). */
export function noteResultConfirmed(matchId: string, athleteId: string, editCount: number): void {
  const key = keyOf(matchId, athleteId);
  const was = confirmedAt.get(key);
  if (was != null && was >= editCount) return;
  confirmedAt.set(key, editCount);
  recordedAt.set(key, Date.now());
  persist();
}

/**
 * The toast's words: TK-RC3 with the timekeeper's short name; with no name,
 * its title and the re-confirm line (TK-RC2) rather than a blank name.
 */
export function resultEditNotice(timekeeperName: string): { title: string; description: string } {
  const name = timekeeperName.trim();
  if (name) return TIMEKEEPER_COPY["TK-RC3"](name);
  return { title: TIMEKEEPER_COPY["TK-RC3"]("").title, description: TIMEKEEPER_COPY["TK-RC2"] };
}

/**
 * Test seam: forget every confirmation and announcement, as a new run does.
 * The stored records go too, unless `keepStored` (a relaunch).
 */
export function resetResultEditNotices({ keepStored = false }: { keepStored?: boolean } = {}): void {
  confirmedAt.clear();
  recordedAt.clear();
  announced.clear();
  hydration = null;
  if (!keepStored) void AsyncStorage.removeItem(RESULT_EDIT_NOTICE_STORAGE_KEY).catch(() => undefined);
}

interface UseResultEditNoticeParams {
  matchId: string;
  /** The viewing athlete; null for the timekeeper. */
  athleteId: string | null;
  /** Only for an athlete whose result someone else records (timekeeper mode). */
  enabled: boolean;
  /** `matches.result_edit_count` of the match in hand. */
  resultEditCount: number;
  /** The athletes the last read lists as confirmed; null when unknown. */
  confirmedAthleteIds: string[] | null;
  /** The timekeeper's short name. */
  timekeeperName: string;
}

export function useResultEditNotice({
  matchId,
  athleteId,
  enabled,
  resultEditCount,
  confirmedAthleteIds,
  timekeeperName,
}: UseResultEditNoticeParams): void {
  // Bumped once the stored records bring this athlete's: the check runs again with it.
  const [storedSeen, sawStored] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => {
    if (!enabled || !athleteId) return;
    let live = true;
    const key = keyOf(matchId, athleteId);
    void hydrate().then((added) => {
      if (live && added.has(key)) sawStored();
    });
    return () => {
      live = false;
    };
  }, [enabled, matchId, athleteId]);

  const prevCountRef = React.useRef(resultEditCount);
  React.useEffect(() => {
    const prevCount = prevCountRef.current;
    prevCountRef.current = resultEditCount;
    if (!enabled || !athleteId || confirmedAthleteIds == null) return;
    const key = keyOf(matchId, athleteId);
    if (confirmedAthleteIds.includes(athleteId)) {
      noteResultConfirmed(matchId, athleteId, Math.min(prevCount, resultEditCount));
      return;
    }
    const at = confirmedAt.get(key);
    if (at == null || resultEditCount <= at || (announced.get(key) ?? -1) >= resultEditCount) return;
    announced.set(key, resultEditCount);
    // Spent: the edit deleted this confirmation (see the header).
    confirmedAt.delete(key);
    recordedAt.delete(key);
    persist();
    const { title, description } = resultEditNotice(timekeeperName);
    toast.info({ text1: title, description });
  }, [enabled, matchId, athleteId, resultEditCount, confirmedAthleteIds, timekeeperName, storedSeen]);
}
