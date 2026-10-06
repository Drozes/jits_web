/**
 * A fake expo-video for the player tests (multi-angle player and the single
 * match player): every `useVideoPlayer` gets a scripted player that records
 * seeks (currentTime writes), rate, mute and time-update-interval writes,
 * play/pause, thumbnails and swaps, and whose events a test emits.
 * `VideoView` renders a Text with the player's URL and counts mounts.
 *
 * Scriptable native behavior (jits-xfvd.16), all opt-in so the defaults stay
 * as they were (every swap and thumbnail resolves at once):
 * - `deferReplace(i)`: the next `replaceAsync` settles only when the test
 *   says, so `readyPlayer` can come before or after the settle.
 * - `deferThumbnails(i)` / `failThumbnails(i)` / `slowThumbnails(i, ms)`:
 *   the next `generateThumbnailsAsync` resolves on demand, rejects, or
 *   resolves after `ms` (a timer, so fake timers drive it).
 * - `pausedBufferStall`: iOS reports a ready item with an empty buffer as
 *   "loading" while paused; `readyPlayer` on a paused player then waits for
 *   `play()` before it reports readyToPlay.
 * - `setNativeTime(i, t)`: the native clock moves without a seek (a new item
 *   starting at 0, or playback progress without a time update).
 * - `buffering` (jits-a4fw.5 review B1): while true, `play()` only records
 *   the intent and `playing` stays false (as on iOS and Android while the
 *   item buffers) until `bufferEnd(i)`; a `pause()` before that cancels it.
 */
import * as React from "react";
import { Text } from "react-native";

type Listener = { event: string; fn: (payload?: any) => void };

export interface FakePlayer {
  id: number;
  source: { uri: string } | null;
  status: string;
  playing: boolean;
  duration: number;
  playbackRate: number;
  rates: number[];
  muted: boolean;
  seeks: number[];
  currentTime: number;
  timeUpdateEventInterval: number;
  /** Every timeUpdateEventInterval write after setup. */
  intervals: number[];
  preservesPitch: boolean;
  /** iOS: a paused item stays "loading" until play() (see readyPlayer). */
  pausedBufferStall: boolean;
  /** A readyPlayer that the paused-buffer stall held back (its duration). */
  heldReady: number | null;
  /** Buffering: play() leaves `playing` false until bufferEnd(). */
  buffering: boolean;
  /** play() was called and not paused since (the native intent while buffering). */
  wantsPlay: boolean;
  play: jest.Mock;
  pause: jest.Mock;
  replaceAsync: jest.Mock;
  generateThumbnailsAsync: jest.Mock;
  addListener: jest.Mock;
  emit: (event: string, payload?: unknown) => void;
}

export const fakePlayers: FakePlayer[] = [];
export const fakeViews: { mounts: number; props: Record<string, any>[] } = { mounts: 0, props: [] };

export function resetFakeVideo(): void {
  replaceQueue.clear();
  thumbQueue.clear();
  fakePlayers.length = 0;
  fakeViews.mounts = 0;
  fakeViews.props = [];
}

export interface Deferred<T = void> {
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}

/** Per player: scripted outcomes for the next replaceAsync / thumbnail calls. */
const replaceQueue = new Map<FakePlayer, Array<Deferred & { promise: Promise<void> }>>();
type ThumbPlan = { kind: "defer"; d: Deferred<unknown[]> & { promise: Promise<unknown[]> } } | { kind: "fail"; error: unknown } | { kind: "slow"; ms: number };
const thumbQueue = new Map<FakePlayer, ThumbPlan[]>();

function deferred<T>(): Deferred<T> & { promise: Promise<T> } {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createPlayer(): FakePlayer {
  const listeners: Listener[] = [];
  let time = 0;
  let rate = 1;
  let interval = 0;
  const thumbsFor = (times: number | number[]) => (Array.isArray(times) ? times : [times]).map((t) => ({ fakeThumbnail: true, t }));
  const p = {
    id: fakePlayers.length,
    source: null,
    status: "idle",
    playing: false,
    duration: 0,
    rates: [] as number[],
    intervals: [] as number[],
    muted: false,
    seeks: [] as number[],
    preservesPitch: false,
    pausedBufferStall: false,
    heldReady: null,
    buffering: false,
    wantsPlay: false,
    get timeUpdateEventInterval() {
      return interval;
    },
    set timeUpdateEventInterval(v: number) {
      interval = v;
      p.intervals.push(v);
    },
    get playbackRate() {
      return rate;
    },
    set playbackRate(v: number) {
      rate = v;
      p.rates.push(v);
    },
    get currentTime() {
      return time;
    },
    set currentTime(v: number) {
      time = v;
      p.seeks.push(v);
    },
    play: jest.fn(() => {
      p.wantsPlay = true;
      if (p.buffering) return;
      p.playing = true;
      if (p.heldReady != null) {
        const duration = p.heldReady;
        p.heldReady = null;
        readyNow(p, duration);
      }
    }),
    pause: jest.fn(() => {
      p.wantsPlay = false;
      p.playing = false;
    }),
    replaceAsync: jest.fn((src: { uri: string }) => {
      p.source = src;
      p.status = "loading";
      p.heldReady = null;
      const next = replaceQueue.get(p)?.shift();
      return next ? next.promise : Promise.resolve();
    }),
    generateThumbnailsAsync: jest.fn((times: number | number[]) => {
      const plan = thumbQueue.get(p)?.shift();
      if (!plan) return Promise.resolve(thumbsFor(times));
      if (plan.kind === "fail") return Promise.reject(plan.error);
      if (plan.kind === "defer") return plan.d.promise;
      return new Promise((resolve) => setTimeout(() => resolve(thumbsFor(times)), plan.ms));
    }),
    addListener: jest.fn((event: string, fn: (payload?: unknown) => void) => {
      const e = { event, fn };
      listeners.push(e);
      return { remove: () => listeners.splice(listeners.indexOf(e), 1) };
    }),
    __setTime: (t: number) => {
      time = t;
    },
    emit: (event: string, payload?: unknown) => {
      if (event === "timeUpdate") time = (payload as { currentTime: number }).currentTime;
      listeners.filter((l) => l.event === event).forEach((l) => l.fn(payload));
    },
  } as unknown as FakePlayer;
  return p;
}

export function useVideoPlayer(_source: unknown, setup?: (p: FakePlayer) => void): FakePlayer {
  const ref = React.useRef<FakePlayer | null>(null);
  if (!ref.current) {
    ref.current = createPlayer();
    fakePlayers.push(ref.current);
    setup?.(ref.current);
    // The setup's own writes are not the app's rate or interval changes.
    ref.current.rates.length = 0;
    ref.current.intervals.length = 0;
  }
  return ref.current;
}

export function VideoView(props: Record<string, any>) {
  React.useEffect(() => {
    fakeViews.mounts += 1;
  }, []);
  fakeViews.props.push(props);
  return React.createElement(Text, { testID: props.testID, style: props.style }, props.player.source?.uri ?? "");
}

function readyNow(p: FakePlayer, duration: number): void {
  p.status = "readyToPlay";
  p.duration = duration;
  p.emit("statusChange", { status: "readyToPlay" });
}

/**
 * The item on player `i` is ready (duration seconds). With
 * `pausedBufferStall` on a paused player it stays "loading" until `play()`.
 */
export function readyPlayer(i: number, duration = 400): void {
  const p = fakePlayers[i];
  if (p.pausedBufferStall && !p.playing) {
    p.heldReady = duration;
    return;
  }
  readyNow(p, duration);
}

/** The next `replaceAsync` on player `i` settles only when the test resolves or rejects it. */
export function deferReplace(i: number): Deferred {
  const p = fakePlayers[i];
  const d = deferred<void>();
  const q = replaceQueue.get(p) ?? [];
  q.push(d);
  replaceQueue.set(p, q);
  return d;
}

/** The next `generateThumbnailsAsync` on player `i` resolves (with the given thumbnails) or rejects on demand. */
export function deferThumbnails(i: number): Deferred<unknown[]> {
  const p = fakePlayers[i];
  const d = deferred<unknown[]>();
  const q = thumbQueue.get(p) ?? [];
  q.push({ kind: "defer", d });
  thumbQueue.set(p, q);
  return d;
}

/** The next `generateThumbnailsAsync` on player `i` rejects. */
export function failThumbnails(i: number, error: unknown = new Error("thumbnail failed")): void {
  const p = fakePlayers[i];
  const q = thumbQueue.get(p) ?? [];
  q.push({ kind: "fail", error });
  thumbQueue.set(p, q);
}

/** The next `generateThumbnailsAsync` on player `i` resolves after `ms` (a timer). */
export function slowThumbnails(i: number, ms: number): void {
  const p = fakePlayers[i];
  const q = thumbQueue.get(p) ?? [];
  q.push({ kind: "slow", ms });
  thumbQueue.set(p, q);
}

/** The native clock of player `i` reads `t` (no seek recorded, no event). */
export function setNativeTime(i: number, t: number): void {
  (fakePlayers[i] as unknown as { __setTime: (t: number) => void }).__setTime(t);
}

export function tick(i: number, t: number): void {
  fakePlayers[i].emit("timeUpdate", { currentTime: t, bufferedPosition: t });
}

/** Player `i` finished buffering: it starts playing only if play() is still wanted. */
export function bufferEnd(i: number): void {
  const p = fakePlayers[i];
  p.buffering = false;
  if (p.wantsPlay) {
    p.playing = true;
    p.emit("playingChange", { isPlaying: true });
  }
}
