/**
 * Blocked athletes, once per session (jits-rog5.11, App Review 1.2).
 *
 * Two sets, read together by `loadBlocks()`:
 *  - `ids`: every athlete in a block with me, either direction
 *    (`get_my_block_ids`). Every list that shows other athletes filters
 *    through it (Rankings, the Arena, incoming challenges, friends, reels).
 *    The server is the authority (it refuses challenges and leaves them out
 *    of `get_arena_nearby`); this is defence in depth.
 *  - `mine`: the athletes I blocked (`get_my_blocked_athletes`), so a profile
 *    knows whether to offer Unblock (I blocked them) or only say the profile
 *    is not available (they blocked me).
 *
 * Loaded by `<ModerationBootstrap />` for the signed-in athlete, re-read on
 * every block and unblock. A failed read keeps the last known sets. A tiny
 * external store so every list reads one snapshot without its own fetch.
 */
import { useSyncExternalStore } from "react";
import {
  blockAthlete,
  getMyBlockIds,
  getMyBlockedAthletes,
  unblockAthlete,
  type BlockedAthlete,
  type ModerationResult,
} from "@jits/shared/api/moderation";
import { moderationClient } from "@/lib/moderation/client";

export interface BlockState {
  /** The athlete these sets belong to; null when signed out. */
  athleteId: string | null;
  /** Both reads have landed at least once for this athlete. */
  loaded: boolean;
  ids: ReadonlySet<string>;
  mine: ReadonlySet<string>;
  /** My blocks, most recent first (Settings, Blocked athletes). */
  blockedList: readonly BlockedAthlete[];
}

const EMPTY: BlockState = { athleteId: null, loaded: false, ids: new Set(), mine: new Set(), blockedList: [] };

let state: BlockState = EMPTY;
/** Bumped on every athlete change, so a read for the previous athlete never lands. */
let generation = 0;
const listeners = new Set<() => void>();

function set(next: BlockState) {
  state = next;
  for (const l of [...listeners]) l();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

const snapshot = () => state;

/** Read both sets for `athleteId` (null clears them: sign-out). Never rejects. */
export async function loadBlocks(athleteId: string | null): Promise<boolean> {
  if (athleteId !== state.athleteId) {
    generation += 1;
    set({ ...EMPTY, athleteId });
  }
  if (!athleteId) return false;
  const gen = generation;
  const [ids, mine] = await Promise.all([getMyBlockIds(moderationClient()), getMyBlockedAthletes(moderationClient())]);
  if (gen !== generation) return false;
  if (!ids.ok && !mine.ok) return false;
  const blockedList = mine.ok ? mine.data : state.blockedList;
  const mineIds = new Set(blockedList.map((b) => b.athlete_id));
  // My own blocks are always in the either-direction set, even if that read failed.
  const all = new Set(ids.ok ? ids.data : state.ids);
  for (const id of mineIds) all.add(id);
  set({ athleteId, loaded: state.loaded || (ids.ok && mine.ok), ids: all, mine: mineIds, blockedList });
  return ids.ok && mine.ok;
}

/** Re-read for the current athlete. */
export function refreshBlocks(): Promise<boolean> {
  return loadBlocks(state.athleteId);
}

export function useBlockState(): BlockState {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** Synchronous: is `athleteId` in a block with me (either direction)? */
export function isBlocked(athleteId: string | null | undefined): boolean {
  return !!athleteId && state.ids.has(athleteId);
}

/** `items` without anyone in a block with me; the same array when nothing is filtered. */
export function withoutBlocked<T>(items: readonly T[], idOf: (t: T) => string | null | undefined, ids: ReadonlySet<string>): T[] {
  if (ids.size === 0) return items as T[];
  const out = items.filter((t) => {
    const id = idOf(t);
    return !id || !ids.has(id);
  });
  return out.length === items.length ? (items as T[]) : out;
}

/**
 * Block `athleteId`. On success the athlete joins both sets at once (no wait
 * for the re-read), then both sets are re-read, and the friend list is told
 * (the server removed the friendship).
 */
export async function blockAndRefresh(athleteId: string, displayName: string): Promise<ModerationResult<void>> {
  const res = await blockAthlete(moderationClient(), athleteId);
  if (!res.ok) return res;
  const ids = new Set(state.ids).add(athleteId);
  const mine = new Set(state.mine).add(athleteId);
  const blockedList = [
    { athlete_id: athleteId, display_name: displayName, blocked_at: new Date().toISOString() },
    ...state.blockedList.filter((b) => b.athlete_id !== athleteId),
  ];
  set({ ...state, ids, mine, blockedList });
  // Required here, not imported: it pulls the client in (see ./client).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  (require("@/lib/invites/use-friend-ids") as typeof import("@/lib/invites/use-friend-ids")).notifyFriendsChanged();
  void refreshBlocks();
  return res;
}

/** Unblock `athleteId`, then re-read (they may still have blocked me). */
export async function unblockAndRefresh(athleteId: string): Promise<ModerationResult<void>> {
  const res = await unblockAthlete(moderationClient(), athleteId);
  if (!res.ok) return res;
  const mine = new Set(state.mine);
  mine.delete(athleteId);
  const ids = new Set(state.ids);
  ids.delete(athleteId);
  set({ ...state, ids, mine, blockedList: state.blockedList.filter((b) => b.athlete_id !== athleteId) });
  void refreshBlocks();
  return res;
}

/** Tests only. */
export function __resetBlocksForTests(next?: Partial<BlockState>): void {
  generation += 1;
  set({ ...EMPTY, ...next });
}
