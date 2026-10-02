/**
 * Arena tempo (Adding Flare [09.4], adapted): how busy the lobby is sets the
 * speed of every LIVE pulse, and ONE shared clock drives them all, so every
 * live dot, the header live dot and the ON AIR heartbeat beat in phase.
 *
 * Tempo source: the number of OTHER athletes present in `lobby:online`
 * (self left out), bucketed to the `tempo` tokens:
 *   - quiet  (`tempo.quiet`, 3000 ms): 0 to 2 others live
 *   - normal (`tempo.normal`, 1600 ms): 3 to 9
 *   - busy   (`tempo.busy`, 800 ms): 10 or more
 * The original idea used matches started in the last 10 minutes, which needs
 * a backend query; the lobby count is already on the device (OTA only).
 *
 * The clock is one module-level shared value, `phase`, running 0 to 1 once
 * per cycle on the UI thread (Reanimated, never a JS timer). It runs only
 * while at least one consumer holds it (refcounted), so nothing ticks while
 * no live dot is on screen, while the app is in the background or under
 * Reduce Motion (consumers do not hold it then). A bucket change keeps the
 * phase continuous and eases into the new period over the rest of the
 * current cycle, so a pulse never visibly restarts.
 *
 * The count is fed by `use-lobby-presence.ts` (`publishTempoOthersLive`), so
 * this module stays free of the Supabase client and the Arena store, and any
 * LiveDot can import it.
 */
import * as React from "react";
import { useSyncExternalStore } from "react";
import {
  cancelAnimation,
  Easing,
  makeMutable,
  withRepeat,
  withSequence,
  withTiming,
  useAnimatedStyle,
  type SharedValue,
} from "react-native-reanimated";
import { tempo, useAppActive, useReduceMotion, type TempoToken } from "@/lib/motion";

// ---------------------------------------------------------------------------
// Buckets
// ---------------------------------------------------------------------------

/** Others live from which the lobby reads `normal` / `busy`. */
export const TEMPO_NORMAL_FROM = 3;
export const TEMPO_BUSY_FROM = 10;

/** The tempo bucket for a count of OTHER athletes live in the lobby. */
export function tempoBucket(othersLive: number): TempoToken {
  if (othersLive >= TEMPO_BUSY_FROM) return "busy";
  if (othersLive >= TEMPO_NORMAL_FROM) return "normal";
  return "quiet";
}

/** Others live: the lobby without the signed-in athlete. */
export function othersLive(lobby: ReadonlySet<string>, selfId: string | null): number {
  return lobby.size - (selfId && lobby.has(selfId) ? 1 : 0);
}

// ---------------------------------------------------------------------------
// Lobby feed (published by use-lobby-presence.ts)
// ---------------------------------------------------------------------------

let others = 0;
const lobbyListeners = new Set<() => void>();

/**
 * Called by the lobby store on every presence sync (others live, self left
 * out) and with 0 on channel loss (nothing known reads quiet).
 */
export function publishTempoOthersLive(next: number): void {
  const n = Number.isFinite(next) && next > 0 ? Math.floor(next) : 0;
  if (n === others) return;
  others = n;
  for (const l of lobbyListeners) l();
}

function subscribeLobby(cb: () => void): () => void {
  lobbyListeners.add(cb);
  return () => {
    lobbyListeners.delete(cb);
  };
}

const getBucket = (): TempoToken => tempoBucket(others);

// ---------------------------------------------------------------------------
// The shared clock
// ---------------------------------------------------------------------------

let clock: SharedValue<number> | null = null;

/**
 * The one phase value (0 to 1 per cycle). Created lazily; the jest mock of
 * Reanimated returns a bare number from `makeMutable`, so fall back to a
 * plain holder there.
 */
export function getTempoClock(): SharedValue<number> {
  if (!clock) {
    const made = makeMutable(0) as unknown;
    clock =
      made !== null && typeof made === "object"
        ? (made as SharedValue<number>)
        : ({ value: 0 } as SharedValue<number>);
  }
  return clock;
}

let holders = 0;
let periodMs: number = tempo.quiet;

function loop(period: number) {
  return withRepeat(withTiming(1, { duration: period, easing: Easing.linear }), -1, false);
}

/**
 * (Re)start the clock at its current phase. `from` is the period being left:
 * the rest of the current cycle runs at the mean of the two periods, so the
 * pulse eases into the new speed instead of jumping.
 */
function run(period: number, from?: number) {
  const c = getTempoClock();
  const raw = typeof c.value === "number" && Number.isFinite(c.value) ? c.value : 0;
  const phase = Math.min(Math.max(raw, 0), 1);
  cancelAnimation(c);
  const legPeriod = from === undefined ? period : (from + period) / 2;
  const rest = Math.max(0, Math.round((1 - phase) * legPeriod));
  c.value = withSequence(
    withTiming(1, { duration: rest, easing: Easing.linear }),
    withTiming(0, { duration: 0 }),
    loop(period),
  );
}

/** Take a hold on the clock; it runs while anything holds it. */
export function holdTempoClock(): () => void {
  holders += 1;
  if (holders === 1) run(periodMs);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holders -= 1;
    if (holders === 0) cancelAnimation(getTempoClock());
  };
}

/** Set the cycle length; a running clock eases into it at the same phase. */
export function setTempoPeriod(next: number): void {
  if (next === periodMs) return;
  const from = periodMs;
  periodMs = next;
  if (holders > 0) run(next, from);
}

/** The current cycle length (ms). */
export function getTempoPeriod(): number {
  return periodMs;
}

/** Whether the clock is held (running). For tests and diagnostics. */
export function isTempoClockRunning(): boolean {
  return holders > 0;
}

/**
 * The pulse level at a phase: 0 at rest (phase 0 and 1), 1 at the middle,
 * smoothstep in between (the old LIVE pulse's ease-in-out yoyo).
 */
export function pulseLevel(phase: number): number {
  "worklet";
  const t = phase < 0.5 ? phase * 2 : (1 - phase) * 2;
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
}

// ---------------------------------------------------------------------------
// Hooks
// ---------------------------------------------------------------------------

export interface ArenaTempo {
  /** The lobby's bucket. */
  bucket: TempoToken;
  /** Its cycle length, ms. */
  periodMs: number;
  /** The shared phase, 0 to 1 per cycle. Read it in a worklet. */
  clock: SharedValue<number>;
  /** False under Reduce Motion, in the background, or when `enabled` is false: draw the static state. */
  animate: boolean;
}

/**
 * The lobby tempo and the shared clock. Every consumer that animates on the
 * clock holds it while `enabled` (its live state is true), the app is in the
 * foreground and Reduce Motion is off; otherwise `animate` is false and the
 * consumer draws its static state. Re-renders only when the bucket changes,
 * not on every presence sync.
 */
export function useArenaTempo(enabled = true): ArenaTempo {
  const bucket = useSyncExternalStore(subscribeLobby, getBucket, getBucket);
  const reduceMotion = useReduceMotion();
  const appActive = useAppActive();
  const animate = enabled && appActive && !reduceMotion;
  const period = tempo[bucket];

  // Every consumer reads the same store, so they all agree on the period.
  React.useEffect(() => {
    setTempoPeriod(period);
  }, [period]);

  React.useEffect(() => {
    if (!animate) return;
    return holdTempoClock();
  }, [animate]);

  return { bucket, periodMs: period, clock: getTempoClock(), animate };
}

/** How deep a live dot breathes at the middle of a cycle. */
export const LIVE_DOT_MIN_OPACITY = 0.45;
export const LIVE_DOT_MIN_SCALE = 0.8;

/**
 * The LIVE pulse as an animated style on the shared clock: opacity 1 to 0.45
 * and scale 1 to 0.8 and back once per cycle. Static (opacity 1, scale 1)
 * when `animate` is false (Reduce Motion, background, not live).
 */
export function useLivePulseStyle(enabled = true) {
  const { clock, animate } = useArenaTempo(enabled);
  return useAnimatedStyle(() => {
    const level = animate ? pulseLevel(clock.value) : 0;
    return {
      opacity: 1 - (1 - LIVE_DOT_MIN_OPACITY) * level,
      transform: [{ scale: 1 - (1 - LIVE_DOT_MIN_SCALE) * level }],
    };
  }, [animate]);
}

/** Tests only: stop the clock and forget every hold, period and lobby. */
export function __resetArenaTempoForTests(): void {
  holders = 0;
  periodMs = tempo.quiet;
  others = 0;
  if (clock) {
    cancelAnimation(clock);
    clock.value = 0;
  }
}
