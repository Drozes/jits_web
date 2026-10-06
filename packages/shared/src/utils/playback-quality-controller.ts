import type { NetworkKey, PlaybackSettings, QualityPreference, ServedRendition, TargetRendition } from "./playback-quality";

/**
 * The in-session quality controller (spec section 4): a pure state machine
 * with no timers and no I/O. Every method takes `now` (ms), so it is tested
 * on a fake clock. The player hook feeds it conditions, counted stalls (from
 * the telemetry session, so the two never disagree) and ticks, and applies a
 * returned decision by calling `switchIssued` and starting the swap.
 *
 * At most one decision is outstanding: none is returned while a swap is in
 * flight, nor between `switchIssued` and `switchLanded` / `switchFailed`.
 *
 * Served, not target (owner requirement 2026-10-06): once a file is on the
 * player, `level` is the rendition actually SERVED (after the signer's
 * fallback chain), so switching only moves between copies that exist. A 360
 * target served as 720 sits at 720 and never "steps up"; a file served as
 * the original (no slicer copy) makes the controller inert for that angle:
 * no decision, no count. Pass the served rendition to `sourceAttached`,
 * `switchLanded` and `angleChanged`.
 */

export type SwitchReason = "stall_long" | "stall_repeat" | "smooth";

export interface QualityDecision {
  kind: "step_down" | "step_up";
  from: TargetRendition;
  to: TargetRendition;
  reason: SwitchReason;
}

export interface Availability {
  "720": boolean;
  "360": boolean;
}

export interface ControllerConditions {
  /** Play intent on AND the player is not paused. */
  playing: boolean;
  /** A user seek or a resume seek hold is active. */
  seeking: boolean;
  rate: number;
  /** An angle switch, quality swap or silent re-sign has not landed. */
  swapInFlight: boolean;
  /** The current item has drawn its first frame. */
  frameShown: boolean;
  networkKey: NetworkKey | null;
  expensive: boolean;
}

export interface QualityControllerState {
  switches: number;
  stepDowns: number;
  stepUps: number;
  lockedLow: boolean;
  capReached: boolean;
  steppedDownOnce: boolean;
}

const IDLE: ControllerConditions = {
  playing: false,
  seeking: false,
  rate: 1,
  swapInFlight: false,
  frameShown: false,
  networkKey: null,
  expensive: false,
};

export class QualityController {
  private readonly settings: PlaybackSettings;
  private readonly active: boolean;
  private available: Availability;
  private cond: ControllerConditions = IDLE;
  private condSet = false;
  private _level: TargetRendition;
  private _target: TargetRendition;
  /** The file on the player is the original (no slicer copy): no decisions. */
  private servingOriginal = false;
  /** A decision was issued and has not landed or failed. */
  private outstanding: QualityDecision | null = null;
  /** Start of the open counted stall. */
  private stallOpenAt: number | null = null;
  /** Start times of counted stalls (pruned to the step-down window). */
  private stallStarts: number[] = [];
  private smoothAccrued = 0;
  private lastEventAt: number;
  private lastLandedAt: number;
  private lastStepUpLandedAt: number | null = null;
  private _state: QualityControllerState = {
    switches: 0,
    stepDowns: 0,
    stepUps: 0,
    lockedLow: false,
    capReached: false,
    steppedDownOnce: false,
  };

  constructor(opts: {
    settings: PlaybackSettings;
    preference: QualityPreference;
    target: TargetRendition;
    available: Availability;
    now: number;
  }) {
    this.settings = opts.settings;
    this.active = opts.preference === "auto" && opts.settings.adaptive && opts.settings.maxSwitchesPerSession > 0;
    this._level = opts.target;
    this._target = opts.target;
    this.available = { ...opts.available };
    this.lastEventAt = opts.now;
    this.lastLandedAt = opts.now;
  }

  /** The rendition being played (served, once a file is on the player). Decisions move from here. */
  get level(): TargetRendition {
    return this._level;
  }

  /**
   * The rendition to SIGN next (a re-sign, a retry, an angle switch): the
   * start target, then the last decision's `to`. It differs from `level`
   * only while the file on screen is a fallback (its target copy is
   * missing), so the next angle still gets the wanted copy when it has one.
   */
  get target(): TargetRendition {
    return this._target;
  }

  get state(): QualityControllerState {
    return { ...this._state };
  }

  private guardDown(): boolean {
    const c = this.cond;
    return (
      this.active &&
      !this.servingOriginal &&
      c.playing &&
      !c.seeking &&
      c.rate >= 1 &&
      !c.swapInFlight &&
      c.frameShown &&
      this.outstanding === null
    );
  }

  private guardUp(): boolean {
    return this.guardDown() && this.cond.rate === 1 && this.stallOpenAt === null;
  }

  /** Smooth time accrues only while guardUp held since the previous event. */
  private accrue(now: number): void {
    if (now > this.lastEventAt && this.guardUp()) this.smoothAccrued += now - this.lastEventAt;
    this.lastEventAt = Math.max(this.lastEventAt, now);
  }

  setConditions(c: ControllerConditions, now: number): QualityDecision | null {
    this.accrue(now);
    if (this.condSet && c.networkKey !== this.cond.networkKey) this.smoothAccrued = 0;
    this.cond = { ...c };
    this.condSet = true;
    return this.evaluate(now);
  }

  /** A counted stall started (the telemetry session's `stallCount` incremented). */
  stallStarted(now: number): QualityDecision | null {
    this.accrue(now);
    // Stalls that start while a step-down could not be decided are ignored.
    if (!this.guardDown()) return null;
    this.stallOpenAt = now;
    this.smoothAccrued = 0;
    const windowMs = this.settings.stepDown.windowMs;
    this.stallStarts = this.stallStarts.filter((t) => t >= now - windowMs);
    this.stallStarts.push(now);
    if (this.stallStarts.length >= this.settings.stepDown.stallCount) {
      const d = this.stepDown("stall_repeat", now);
      if (d) return d;
    }
    return this.evaluate(now);
  }

  /** The open counted stall closed. One that ran to the threshold still counts. */
  stallEnded(now: number): QualityDecision | null {
    this.accrue(now);
    if (this.stallOpenAt === null) return null;
    const d = this.checkStallLong(now);
    this.stallOpenAt = null;
    return d;
  }

  tick(now: number): QualityDecision | null {
    this.accrue(now);
    return this.evaluate(now);
  }

  switchIssued(d: QualityDecision, now: number): void {
    this.accrue(now);
    this._level = d.to;
    this._target = d.to;
    this.outstanding = d;
    const s = this._state;
    s.switches += 1;
    if (d.kind === "step_down") {
      s.stepDowns += 1;
      s.steppedDownOnce = true;
      const relapse = this.settings.relapse.windowMs;
      if (relapse > 0 && this.lastStepUpLandedAt !== null && now - this.lastStepUpLandedAt <= relapse) {
        s.lockedLow = true;
      }
    } else {
      s.stepUps += 1;
    }
    if (s.switches >= this.settings.maxSwitchesPerSession) s.capReached = true;
  }

  /**
   * A file went to the player (a first sign, a silent re-sign or a retry):
   * the level follows what it serves. Not a switch, nothing counted.
   */
  sourceAttached(served: ServedRendition, available: Availability, now: number): void {
    this.accrue(now);
    this.available = { ...available };
    this.follow(served);
  }

  private follow(served: ServedRendition | undefined): void {
    if (served === undefined) return;
    this.servingOriginal = served === "original";
    if (served === "720" || served === "360") this._level = served;
  }

  switchLanded(available: Availability, now: number, served?: ServedRendition): void {
    this.accrue(now);
    const d = this.outstanding;
    this.outstanding = null;
    this.available = { ...available };
    this.follow(served);
    this.lastLandedAt = now;
    this.smoothAccrued = 0;
    if (d?.kind === "step_up") this.lastStepUpLandedAt = now;
  }

  /** The swap was superseded or errored: the level stays at `d.to`, the switch stays counted. */
  switchFailed(now: number): void {
    this.accrue(now);
    this.outstanding = null;
  }

  angleChanged(available: Availability, now: number, served?: ServedRendition): void {
    this.accrue(now);
    this.available = { ...available };
    this.follow(served);
    this.stallStarts = [];
    this.stallOpenAt = null;
    this.smoothAccrued = 0;
    this.lastLandedAt = now;
  }

  private evaluate(now: number): QualityDecision | null {
    return this.checkStallLong(now) ?? this.stepUp(now);
  }

  private checkStallLong(now: number): QualityDecision | null {
    if (this.stallOpenAt === null || now - this.stallOpenAt < this.settings.stepDown.stallMs) return null;
    return this.stepDown("stall_long", now);
  }

  private stepDown(reason: SwitchReason, now: number): QualityDecision | null {
    if (!this.guardDown() || this._level !== "720" || !this.available["360"]) return null;
    if (this._state.capReached || this._state.switches >= this.settings.maxSwitchesPerSession) return null;
    if (now - this.lastLandedAt < this.settings.stepDown.cooldownMs) return null;
    return { kind: "step_down", from: "720", to: "360", reason };
  }

  private stepUp(now: number): QualityDecision | null {
    const up = this.settings.stepUp;
    if (!this.guardUp() || this._level !== "360" || !this.available["720"] || this._state.lockedLow) return null;
    if (this._state.switches + 2 > this.settings.maxSwitchesPerSession) return null;
    const key = this.cond.networkKey;
    if (key === null || !up.networks.includes(key)) return null;
    if (this.cond.expensive && !up.onExpensive) return null;
    if (now - this.lastLandedAt < up.cooldownMs) return null;
    const need = this._state.steppedDownOnce ? up.smoothMsAfterStepDown : up.smoothMs;
    if (this.smoothAccrued < need) return null;
    return { kind: "step_up", from: "360", to: "720", reason: "smooth" };
  }
}
