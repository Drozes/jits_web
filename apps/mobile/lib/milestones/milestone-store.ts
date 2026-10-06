import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Phase 1 milestones (specs/matches-tab 10.6, PM8): first match, first win
 * and first highlight each celebrate ONCE per athlete per device.
 *
 * Device-local on purpose (same pattern as `lib/film-room/seen-store.ts`):
 * AsyncStorage `milestones:v1:<athleteId>` holds `{ [id]: markedAtIso }`. A
 * milestone is marked the moment its celebration starts (`claimMilestone`),
 * in memory first and synchronously, so a crash mid-animation never repeats
 * it and a Home fire suppresses the Matches fire. The 7 day freshness guard
 * stops a reinstall, a new phone or a returning athlete from celebrating an
 * old first.
 *
 * `decideMilestone` is pure: it turns the screen's data into the one
 * celebration to show (or none). The UI slice owns the banner, confetti and
 * haptic; this module only says which, and how (loss exception, Reduce
 * Motion).
 */

export type MilestoneId = "first_match" | "first_win" | "first_highlight";

export const MILESTONE_IDS: readonly MilestoneId[] = ["first_match", "first_win", "first_highlight"];

/** Only an event this recent celebrates. */
export const MILESTONE_FRESH_MS = 7 * 24 * 60 * 60 * 1000;

/** Banner copy (spec 11, C-C1 to C-C3). */
export const MILESTONE_COPY: Record<MilestoneId, string> = {
  first_match: "First match in the books",
  first_win: "First win. That one counts.",
  first_highlight: "Your first highlight is ready",
};

export function milestoneStorageKey(athleteId: string): string {
  return `milestones:v1:${athleteId}`;
}

export type MilestoneSurface = "home" | "matches";

export interface MilestoneInputs {
  surface: MilestoneSurface;
  /** Device ms. */
  now: number;
  /** True while an Arena match is active: nothing fires (it waits for the next focus). */
  inActiveMatch: boolean;
  /** True while a modal or sheet covers the surface: nothing fires. */
  overModal?: boolean;
  /** Reduce Motion: no particles (the banner and the haptic rule are unchanged). */
  reduceMotion?: boolean;
  /** Computed stats (`get_athlete_stats`); null while unknown. */
  stats?: { wins: number; losses: number; draws: number } | null;
  /** The newest library item (feed order); null while unknown or empty. */
  newestMatch?: { matchId: string; completedAt: string | null; outcome: "win" | "loss" | "draw" | null } | null;
  /** The newest WIN in the loaded library; null while unknown or none loaded. */
  newestWin?: { matchId: string; completedAt: string | null } | null;
  /**
   * First page of `get_my_highlights` (limit 10): the athlete has exactly one
   * reel when `count === 1` and there is no further page. Null while unknown
   * or with clips off.
   */
  highlights?: { count: number; hasMore: boolean; first: { highlightId: string; unseen: boolean; readyAt: string } | null } | null;
}

export interface MilestoneCelebration {
  /** The banner and burst shown. */
  milestone: MilestoneId;
  /** Everything marked seen in the same write (first match that is also the first win marks both). */
  marks: MilestoneId[];
  /** Banner copy. */
  copy: string;
  /** The celebrated card (match id) or tile (highlight id). */
  targetId: string;
  /** Success haptic. False for a loss (the loss exception). */
  haptic: boolean;
  /** Confetti palette: `brand`, or `ink` only (`ink`, `ink-2`, `ink-3`) for a loss. */
  confetti: "brand" | "ink";
  /** Draw particles at all (false under Reduce Motion). */
  particles: boolean;
}

function isFresh(iso: string | null | undefined, now: number): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  return Number.isFinite(t) && now - t <= MILESTONE_FRESH_MS && t <= now + 60_000;
}

function celebration(
  milestone: MilestoneId,
  marks: MilestoneId[],
  targetId: string,
  loss: boolean,
  reduceMotion: boolean,
): MilestoneCelebration {
  return {
    milestone,
    marks,
    copy: MILESTONE_COPY[milestone],
    targetId,
    haptic: !loss,
    confetti: loss ? "ink" : "brand",
    particles: !reduceMotion,
  };
}

/**
 * The one celebration for this surface now, or null. Matches considers all
 * three (a first win, with its first match, beats a first match, which beats
 * a first highlight; the rest wait for the next focus); Home only the first
 * highlight. Never during an active match or over a modal.
 */
export function decideMilestone(
  inputs: MilestoneInputs,
  seen: ReadonlySet<MilestoneId>,
): MilestoneCelebration | null {
  if (inputs.inActiveMatch || inputs.overModal) return null;
  const reduce = inputs.reduceMotion === true;
  const now = inputs.now;

  if (inputs.surface === "matches" && inputs.stats) {
    const { wins, losses, draws } = inputs.stats;
    const total = wins + losses + draws;
    const newest = inputs.newestMatch ?? null;
    const firstMatchDue =
      !seen.has("first_match") && total === 1 && !!newest && isFresh(newest.completedAt, now);
    if (firstMatchDue && newest) {
      if (newest.outcome === "win" && wins === 1 && !seen.has("first_win")) {
        return celebration("first_win", ["first_match", "first_win"], newest.matchId, false, reduce);
      }
      return celebration("first_match", ["first_match"], newest.matchId, newest.outcome === "loss", reduce);
    }
    const win = inputs.newestWin ?? null;
    if (!seen.has("first_win") && wins === 1 && win && isFresh(win.completedAt, now)) {
      return celebration("first_win", ["first_win"], win.matchId, false, reduce);
    }
  }

  const hl = inputs.highlights ?? null;
  if (
    !seen.has("first_highlight") &&
    hl &&
    hl.count === 1 &&
    !hl.hasMore &&
    hl.first?.unseen === true &&
    isFresh(hl.first.readyAt, now)
  ) {
    return celebration("first_highlight", ["first_highlight"], hl.first.highlightId, false, reduce);
  }
  return null;
}

// ---- the store --------------------------------------------------------------

const marked = new Map<string, Map<MilestoneId, string>>();
const loading = new Map<string, Promise<void>>();

function memoryFor(athleteId: string): Map<MilestoneId, string> {
  let m = marked.get(athleteId);
  if (!m) {
    m = new Map();
    marked.set(athleteId, m);
  }
  return m;
}

function parseStored(raw: string | null): Map<MilestoneId, string> {
  const out = new Map<MilestoneId, string>();
  if (!raw) return out;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      for (const id of MILESTONE_IDS) {
        const v = (parsed as Record<string, unknown>)[id];
        if (typeof v === "string" || v === true) out.set(id, typeof v === "string" ? v : "");
      }
    }
  } catch {
    // Unreadable storage reads as nothing celebrated; the freshness guard bounds the cost.
  }
  return out;
}

/** The milestones this device already celebrated for the athlete (memory merged with storage). */
export async function loadMilestones(athleteId: string): Promise<ReadonlySet<MilestoneId>> {
  let running = loading.get(athleteId);
  if (!running) {
    running = (async () => {
      let raw: string | null = null;
      try {
        raw = await AsyncStorage.getItem(milestoneStorageKey(athleteId));
      } catch {
        raw = null;
      }
      const mem = memoryFor(athleteId);
      // A mark made while the read was in flight stays.
      for (const [id, at] of parseStored(raw)) if (!mem.has(id)) mem.set(id, at);
    })();
    loading.set(athleteId, running);
  }
  await running;
  return seenMilestones(athleteId);
}

/** Synchronous view of what is known so far (call `loadMilestones` first). */
export function seenMilestones(athleteId: string): ReadonlySet<MilestoneId> {
  return new Set(memoryFor(athleteId).keys());
}

function persist(athleteId: string): void {
  const obj: Record<string, string> = {};
  for (const [id, at] of memoryFor(athleteId)) obj[id] = at;
  void AsyncStorage.setItem(milestoneStorageKey(athleteId), JSON.stringify(obj)).catch(() => undefined);
}

/**
 * Starts a celebration: true when it may show, after marking every id in
 * `marks` in ONE write. False when any of them was already marked (another
 * surface fired first), in which case nothing is written.
 */
export function claimMilestone(athleteId: string, c: Pick<MilestoneCelebration, "marks">, now = Date.now()): boolean {
  if (c.marks.length === 0) return false;
  const mem = memoryFor(athleteId);
  if (c.marks.some((id) => mem.has(id))) return false;
  const at = new Date(now).toISOString();
  for (const id of c.marks) mem.set(id, at);
  persist(athleteId);
  return true;
}

/** Test-only reset of the in-memory state. */
export function __resetMilestonesForTests(): void {
  marked.clear();
  loading.clear();
}
