import type { VideoPlayer } from "expo-video";
import type { HighlightSource } from "./use-my-highlight";
import { poolAssignment } from "./reel-pager-math";

/**
 * The swipe viewer's player pool (jits-a4fw.5), as a plain controller so the
 * slot logic is unit tested without native video. The hook
 * (`use-reel-player-pool.ts`) owns the players' lifecycle and events.
 *
 * - A fixed set of players (3 in the pager: previous, current, next). Slot k
 *   serves the page `poolAssignment` gives it; a one-page swipe reassigns one
 *   slot, so the page swiped to is already loaded and paused at frame 0.
 * - Pages OFFER their signed source (`offer`); the controller loads it into
 *   the page's slot with `replaceAsync` (in place, never a new player) and
 *   remembers it for when the page gets a slot later.
 * - Only the visible page plays (unless the athlete paused it); a page that
 *   stops being visible pauses and rewinds to frame 0.
 * - The poster covers a slot until its item has played AND a frame is up
 *   (a paused, never-played AVPlayer item can be black).
 */
export interface SlotSnapshot {
  /** The slot serving this page, null when no player is assigned. */
  slot: number | null;
  player: VideoPlayer | null;
  covered: boolean;
  /** The athlete paused the visible page (tap). */
  paused: boolean;
  /**
   * `cover` for a 9:16 reel; `contain` (over its blurred poster) for a legacy
   * asset whose intrinsic aspect is off 9:16 by more than 10% (spec 8.2).
   */
  fit: "cover" | "contain";
}

/** True when a video of `width` x `height` is within 9:16 plus or minus 10%. */
export function isReelAspect(width: number, height: number): boolean {
  if (!(width > 0) || !(height > 0)) return true;
  return Math.abs(width / height - 9 / 16) / (9 / 16) <= 0.1;
}

export interface PoolHooks {
  sourceAttached?: (slot: number, resigned: boolean) => void;
  playIntent?: (slot: number, want: boolean) => void;
  firstFrame?: (slot: number) => void;
}

interface Slot {
  index: number | null;
  key: string | null;
  url: string | null;
  seq: number;
  doneSeq: number;
  ready: boolean;
  played: boolean;
  firstFrame: boolean;
  progress: number;
  /** Intrinsic aspect off 9:16 (from the video track); false until known. */
  offAspect: boolean;
}

const NO_SLOT: SlotSnapshot = { slot: null, player: null, covered: true, paused: false, fit: "cover" };

function safe(fn: () => void): void {
  try {
    fn();
  } catch {
    // A released player (unmount): nothing to drive.
  }
}

export class ReelPoolController {
  private slots: Slot[];
  private active = 0;
  private userPaused = false;
  private focused = true;
  private suspended = false;
  private alive = true;
  private offered = new Map<number, { key: string; source: HighlightSource }>();
  private errorHandlers = new Map<number, () => void>();
  private listeners = new Set<() => void>();
  private progressListeners = new Set<() => void>();
  private snapshots = new Map<number, SlotSnapshot>();

  constructor(
    readonly players: VideoPlayer[],
    private hooks: PoolHooks = {},
  ) {
    this.slots = players.map(() => ({ index: null, key: null, url: null, seq: 0, doneSeq: 0, ready: false, played: false, firstFrame: false, progress: 0, offAspect: false }));
  }

  // ---- subscriptions (useSyncExternalStore) ----

  subscribe = (cb: () => void): (() => void) => {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  };

  subscribeProgress = (cb: () => void): (() => void) => {
    this.progressListeners.add(cb);
    return () => this.progressListeners.delete(cb);
  };

  private emit(): void {
    this.snapshots.clear();
    for (const l of this.listeners) l();
  }

  slotOf(index: number): number | null {
    const k = this.slots.findIndex((s) => s.index === index);
    return k === -1 ? null : k;
  }

  snapshot(index: number): SlotSnapshot {
    const cached = this.snapshots.get(index);
    if (cached) return cached;
    const k = this.slotOf(index);
    let snap = NO_SLOT;
    if (k !== null) {
      const s = this.slots[k];
      const covered = !(s.url !== null && s.played && (s.firstFrame || s.ready));
      snap = {
        slot: k,
        player: this.players[k],
        covered,
        paused: index === this.active && this.userPaused,
        fit: s.offAspect ? "contain" : "cover",
      };
    }
    this.snapshots.set(index, snap);
    return snap;
  }

  /** The page's slot already holds its item (it was preloaded before it became visible). */
  isLoaded(index: number): boolean {
    const k = this.slotOf(index);
    return k !== null && this.slots[k].url !== null;
  }

  progress(index: number): number {
    const k = this.slotOf(index);
    return k === null ? 0 : this.slots[k].progress;
  }

  // ---- inputs ----

  /** The visible page changed (or the lane grew). */
  setActive(active: number, count: number): void {
    const prev = this.active;
    const moved = active !== prev;
    this.active = active;
    if (moved) this.userPaused = false;
    const plan = poolAssignment(active, count, this.slots.length);
    plan.forEach((index, k) => {
      const s = this.slots[k];
      if (s.index === index) return;
      s.index = index;
      s.key = null;
      s.url = null;
      s.ready = s.played = s.firstFrame = s.offAspect = false;
      s.progress = 0;
      const offer = index === null ? undefined : this.offered.get(index);
      if (offer) this.load(k, offer.key, offer.source);
    });
    if (moved) {
      const k = this.slotOf(prev);
      if (k !== null) this.rewind(k);
    }
    this.applyPlayback();
    this.emit();
  }

  /** A page's signed source (null: none yet / gone). `key` is `highlightId:version`. */
  offer(index: number, key: string, source: HighlightSource | null): void {
    if (!source) {
      this.offered.delete(index);
      return;
    }
    this.offered.set(index, { key, source });
    const k = this.slotOf(index);
    if (k !== null) this.load(k, key, source);
  }

  onError(index: number, handler: (() => void) | null): void {
    if (handler) this.errorHandlers.set(index, handler);
    else this.errorHandlers.delete(index);
  }

  /** Tap on the visible page: pause / play. */
  toggle(index: number): void {
    if (index !== this.active) return;
    const k = this.slotOf(index);
    if (k === null) return;
    this.userPaused = !this.userPaused;
    this.applyPlayback();
    this.emit();
  }

  setMuted(muted: boolean): void {
    for (const p of this.players) safe(() => (p.muted = muted));
  }

  /** A sheet or alert is open on the visible page: it pauses until closed (spec 8.3). */
  setSuspended(suspended: boolean): void {
    this.suspended = suspended;
    this.applyPlayback();
  }

  /** Screen focus / app foreground: only a focused screen plays. */
  setFocused(focused: boolean): void {
    this.focused = focused;
    this.applyPlayback();
  }

  /** (Re)arms the pool when the viewer mounts. */
  start(): void {
    this.alive = true;
  }

  release(): void {
    this.alive = false;
    for (const p of this.players) safe(() => p.pause());
  }

  // ---- player events (wired by the hook) ----

  statusChanged(k: number, status: string): void {
    const s = this.slots[k];
    if (status === "error") {
      const handler = s.index === null ? undefined : this.errorHandlers.get(s.index);
      handler?.();
    } else if (status === "readyToPlay" && s.doneSeq === s.seq && s.url && !s.ready) {
      s.ready = true;
      this.emit();
    }
  }

  playingChanged(k: number, isPlaying: boolean): void {
    const s = this.slots[k];
    if (isPlaying && s.doneSeq === s.seq && s.url && !s.played) {
      s.played = true;
      this.emit();
    }
  }

  firstFrame(k: number): void {
    const s = this.slots[k];
    if (s.doneSeq === s.seq && s.url && !s.firstFrame) {
      s.firstFrame = true;
      this.hooks.firstFrame?.(k);
      this.emit();
    }
  }

  videoSize(k: number, width: number, height: number): void {
    const s = this.slots[k];
    const off = !isReelAspect(width, height);
    if (s.url && off !== s.offAspect) {
      s.offAspect = off;
      this.emit();
    }
  }

  timeUpdate(k: number, currentTime: number, duration: number): void {
    const s = this.slots[k];
    if (s.index !== this.active || !(duration > 0)) return;
    s.progress = Math.max(0, Math.min(1, currentTime / duration));
    for (const l of this.progressListeners) l();
  }

  // ---- internals ----

  private load(k: number, key: string, source: HighlightSource): void {
    const s = this.slots[k];
    if (s.url === source.url) return;
    const player = this.players[k];
    const sameKey = s.key === key && s.url !== null;
    let at = 0;
    if (sameKey) safe(() => (at = player.currentTime));
    s.key = key;
    s.url = source.url;
    if (!sameKey) {
      s.ready = s.played = s.firstFrame = s.offAspect = false;
      s.progress = 0;
    }
    const seq = ++s.seq;
    this.hooks.sourceAttached?.(k, sameKey);
    const settle = (ok: boolean) => {
      if (!this.alive) return;
      if (seq !== s.seq) {
        // Superseded: if the latest swap already landed, this stale one may
        // have replaced its item, so load the latest URL again.
        if (s.doneSeq === s.seq && s.url && s.key) this.reload(k);
        return;
      }
      s.doneSeq = seq;
      if (!ok) {
        const handler = s.index === null ? undefined : this.errorHandlers.get(s.index);
        handler?.();
        return;
      }
      safe(() => {
        if (player.status === "readyToPlay") s.ready = true;
        if (at > 0) player.currentTime = at;
      });
      this.applyPlayback();
      this.emit();
    };
    let swap: Promise<void>;
    try {
      swap = player.replaceAsync(source.url);
    } catch {
      swap = Promise.reject(new Error("released"));
    }
    swap.then(
      () => settle(true),
      () => settle(false),
    );
  }

  private reload(k: number): void {
    const s = this.slots[k];
    const key = s.key;
    if (!s.url || !key) return;
    s.url = null;
    const offer = s.index === null ? undefined : this.offered.get(s.index);
    if (offer) this.load(k, key, offer.source);
  }

  private rewind(k: number): void {
    const player = this.players[k];
    safe(() => {
      player.pause();
      player.currentTime = 0;
    });
    this.slots[k].progress = 0;
  }

  private applyPlayback(): void {
    if (!this.alive) return;
    this.slots.forEach((s, k) => {
      const player = this.players[k];
      const play = this.focused && !this.suspended && s.index === this.active && s.url !== null && s.doneSeq === s.seq && !this.userPaused;
      let changed = false;
      safe(() => {
        if (play && !player.playing) {
          player.play();
          changed = true;
        } else if (!play && player.playing) {
          player.pause();
          changed = true;
        }
      });
      if (changed) this.hooks.playIntent?.(k, play);
    });
  }
}
