/**
 * Drift correction for lock-stepped angle players, driven from JS by the
 * master clock's 250 ms time updates (research 01, section 3). Pure, so the
 * math is unit-tested without a player.
 *
 * error = slave's actual local time - where it should be (seconds; positive
 * means the slave runs ahead). Per sample:
 *   |error| <= DEADBAND_S (one frame)       hold: rate back to the base rate
 *   |error| <  hard-seek threshold          nudge: base * (1 - clamp(error * GAIN, +-MAX_NUDGE))
 *   otherwise                               seek: exact re-seek to the target
 * The threshold is HARD_SEEK_VISIBLE_S for the angle on screen (an exact
 * seek freezes its picture briefly) and HARD_SEEK_HIDDEN_S for a hidden
 * standby (re-seeked freely). After a seek the slave settles for
 * SEEK_SETTLE_MS before it is judged again, so one slow seek never cascades
 * into a seek storm. Errors are smoothed as the median of the last
 * SMOOTH_SAMPLES samples to suppress bridge jitter.
 */

export const FRAME_S = 1 / 30;
export const DEADBAND_S = FRAME_S;
export const HARD_SEEK_VISIBLE_S = 0.25;
export const HARD_SEEK_HIDDEN_S = 0.12;
export const GAIN = 0.5;
export const MAX_NUDGE = 0.05;
export const SEEK_SETTLE_MS = 750;
export const SMOOTH_SAMPLES = 3;
/** A hot standby within this of its target can take a swap (an instant cut). */
export const SWAP_MAX_ERROR_S = 2 * FRAME_S;

export type Correction = { kind: "hold"; rate: number } | { kind: "nudge"; rate: number } | { kind: "seek" };

export function correctionFor(errorS: number, baseRate: number, visible: boolean): Correction {
  const abs = Math.abs(errorS);
  if (!Number.isFinite(errorS)) return { kind: "seek" };
  if (abs <= DEADBAND_S) return { kind: "hold", rate: baseRate };
  if (abs >= (visible ? HARD_SEEK_VISIBLE_S : HARD_SEEK_HIDDEN_S)) return { kind: "seek" };
  const nudge = Math.max(-MAX_NUDGE, Math.min(MAX_NUDGE, errorS * GAIN));
  return { kind: "nudge", rate: baseRate * (1 - nudge) };
}

/**
 * Where a player is now, from its last time update (the event, not the
 * synchronous getter: on Android that getter blocks on the main thread).
 */
export function extrapolate(sample: { t: number; at: number } | null, now: number, playing: boolean, rate: number): number | null {
  if (!sample) return null;
  if (!playing) return sample.t;
  return sample.t + (Math.max(0, now - sample.at) / 1000) * rate;
}

/** Median of the last few error samples for one slave, plus its post-seek settle window. */
export class DriftFilter {
  private samples: number[] = [];
  private settleUntil = 0;

  /** Add a sample; returns the smoothed error, or null while settling. */
  push(errorS: number, now: number): number | null {
    if (now < this.settleUntil) return null;
    this.samples.push(errorS);
    if (this.samples.length > SMOOTH_SAMPLES) this.samples.shift();
    const sorted = [...this.samples].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  }

  /** The slave was just seeked: forget the history and settle. */
  seeked(now: number): void {
    this.samples = [];
    this.settleUntil = now + SEEK_SETTLE_MS;
  }

  reset(): void {
    this.samples = [];
    this.settleUntil = 0;
  }
}

/** Residual sync error distribution for telemetry (absolute ms, capped sample). */
export class ResidualStats {
  private values: number[] = [];
  constructor(private readonly cap = 2000) {}

  add(errorS: number): void {
    if (!Number.isFinite(errorS)) return;
    if (this.values.length >= this.cap) this.values.shift();
    this.values.push(Math.abs(errorS) * 1000);
  }

  percentile(p: number): number | null {
    if (this.values.length === 0) return null;
    const sorted = [...this.values].sort((a, b) => a - b);
    const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
    return Math.round(sorted[i]);
  }

  get count(): number {
    return this.values.length;
  }
}
