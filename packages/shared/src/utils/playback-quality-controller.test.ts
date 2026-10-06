import { describe, it, expect, beforeEach } from "vitest";
import {
  QualityController,
  type ControllerConditions,
  type QualityDecision,
} from "./playback-quality-controller";
import { BUILTIN_PLAYBACK_SETTINGS, type PlaybackSettings, type QualityPreference, type TargetRendition } from "./playback-quality";

/** A fake clock and a harness that applies decisions like the player hook does. */
let now = 0;
const BOTH = { "720": true, "360": true } as const;
const PLAYING: ControllerConditions = {
  playing: true,
  seeking: false,
  rate: 1,
  swapInFlight: false,
  frameShown: true,
  networkKey: "wifi",
  expensive: false,
};

function settings(patch: (s: PlaybackSettings) => void = () => undefined): PlaybackSettings {
  const s = JSON.parse(JSON.stringify(BUILTIN_PLAYBACK_SETTINGS)) as PlaybackSettings;
  patch(s);
  return s;
}

function make(
  opts: { target?: TargetRendition; preference?: QualityPreference; settings?: PlaybackSettings; available?: { "720": boolean; "360": boolean }; cond?: Partial<ControllerConditions> } = {},
) {
  const c = new QualityController({
    settings: opts.settings ?? settings(),
    preference: opts.preference ?? "auto",
    target: opts.target ?? "720",
    available: opts.available ?? BOTH,
    now,
  });
  const first = c.setConditions({ ...PLAYING, ...opts.cond }, now);
  expect(first).toBeNull();
  return c;
}

const at = (ms: number) => {
  now = ms;
  return now;
};

/** Advance in 250 ms ticks, returning the first decision. */
function run(c: QualityController, untilMs: number): { d: QualityDecision | null; at: number } {
  while (now < untilMs) {
    now = Math.min(untilMs, now + 250);
    const d = c.tick(now);
    if (d) return { d, at: now };
  }
  return { d: null, at: now };
}

/** Issue and land a decision (the hook's swap). */
function apply(c: QualityController, d: QualityDecision, landAfterMs = 500) {
  c.switchIssued(d, now);
  now += landAfterMs;
  c.switchLanded(BOTH, now);
}

beforeEach(() => {
  now = 1_000_000;
});

describe("QualityController step-down", () => {
  it("stall_long fires at exactly stallMs while the stall is open", () => {
    const c = make();
    at(now + 5000);
    expect(c.stallStarted(now)).toBeNull();
    const start = now;
    expect(c.tick(start + 999)).toBeNull();
    expect(c.tick(start + 1000)).toEqual({ kind: "step_down", from: "720", to: "360", reason: "stall_long" });
  });

  it("a stall that ended at or past the threshold still counts on stallEnded", () => {
    const c = make();
    at(now + 5000);
    c.stallStarted(now);
    expect(c.stallEnded(now + 1000)).toEqual({ kind: "step_down", from: "720", to: "360", reason: "stall_long" });
    const c2 = make();
    at(now + 5000);
    c2.stallStarted(now);
    expect(c2.stallEnded(now + 999)).toBeNull();
  });

  it("stall_repeat at the 2nd counted stall within 30 s", () => {
    const c = make();
    at(now + 5000);
    c.stallStarted(now);
    expect(c.stallEnded(now + 200)).toBeNull();
    at(now + 29_000);
    expect(c.stallStarted(now)).toEqual({ kind: "step_down", from: "720", to: "360", reason: "stall_repeat" });
  });

  it("stall_repeat at exactly 30 s apart, not at 31 s", () => {
    const c = make();
    at(now + 5000);
    const first = now;
    c.stallStarted(first);
    c.stallEnded(first + 200);
    expect(c.stallStarted(first + 31_000)).toBeNull();
    const c2 = make();
    c2.stallStarted(now);
    c2.stallEnded(now + 200);
    expect(c2.stallStarted(now + 30_000)?.reason).toBe("stall_repeat");
  });

  it.each<[string, Partial<ControllerConditions>]>([
    ["paused", { playing: false }],
    ["seeking", { seeking: true }],
    ["at 0.5x", { rate: 0.5 }],
    ["at 0.25x", { rate: 0.25 }],
    ["while a swap is in flight", { swapInFlight: true }],
    ["before the first frame", { frameShown: false }],
  ])("no decision %s: the stall is not even counted", (_name, cond) => {
    const c = make({ cond });
    at(now + 5000);
    expect(c.stallStarted(now)).toBeNull();
    expect(run(c, now + 5000).d).toBeNull();
    expect(c.stallEnded(now)).toBeNull();
    // Back to normal: the earlier stall was not counted, so one short stall is not a repeat.
    c.setConditions(PLAYING, now);
    c.stallStarted(now + 10);
    expect(c.stallEnded(now + 100)).toBeNull();
  });

  it.each<[string, { preference?: QualityPreference; settings?: PlaybackSettings }]>([
    ["preference high", { preference: "high" }],
    ["preference data_saver", { preference: "data_saver" }],
    ["adaptive false", { settings: settings((s) => (s.adaptive = false)) }],
    ["maxSwitchesPerSession 0", { settings: settings((s) => (s.maxSwitchesPerSession = 0)) }],
  ])("never decides with %s", (_name, opts) => {
    const c = make(opts);
    at(now + 5000);
    expect(c.stallStarted(now)).toBeNull();
    expect(run(c, now + 5000).d).toBeNull();
    const low = make({ ...opts, target: "360" });
    expect(run(low, now + 600_000).d).toBeNull();
  });

  it("rate 2x counts stalls toward a step-down", () => {
    const c = make({ cond: { rate: 2 } });
    at(now + 5000);
    c.stallStarted(now);
    expect(c.tick(now + 1000)?.reason).toBe("stall_long");
  });

  it("no step-down within cooldownMs of the creation or a landing", () => {
    const c = make();
    c.stallStarted(now + 100);
    expect(c.tick(now + 1100)).toBeNull();
    expect(c.tick(now + 1999)).toBeNull();
    expect(c.tick(now + 2000)?.reason).toBe("stall_long");
  });

  it("no step-down when the angle has no 360 copy (nothing counted)", () => {
    const c = make({ available: { "720": true, "360": false } });
    at(now + 5000);
    c.stallStarted(now);
    expect(run(c, now + 5000).d).toBeNull();
    expect(c.state.switches).toBe(0);
  });

  it("no decision between switchIssued and switchLanded / switchFailed", () => {
    const c = make();
    at(now + 5000);
    c.stallStarted(now);
    const { d } = run(c, now + 2000);
    c.switchIssued(d!, now);
    expect(c.level).toBe("360");
    c.stallStarted(now + 10);
    expect(run(c, now + 200_000).d).toBeNull();
    c.switchFailed(now);
    expect(c.level).toBe("360");
    expect(c.state.switches).toBe(1);
  });
});

describe("QualityController step-up", () => {
  it("after 30 s of smooth playback on wifi", () => {
    const c = make({ target: "360" });
    const start = now;
    const { d, at: when } = run(c, start + 60_000);
    expect(d).toEqual({ kind: "step_up", from: "360", to: "720", reason: "smooth" });
    expect(when - start).toBe(30_000);
  });

  it("not on cellular_3g (not a step-up network), and not on expensive when onExpensive is false", () => {
    expect(run(make({ target: "360", cond: { networkKey: "cellular_3g" } }), now + 120_000).d).toBeNull();
    const s = settings((x) => (x.stepUp.onExpensive = false));
    expect(run(make({ target: "360", settings: s, cond: { networkKey: "cellular_4g", expensive: true } }), now + 120_000).d).toBeNull();
    expect(run(make({ target: "360", settings: s, cond: { networkKey: "cellular_4g" } }), now + 120_000).d?.kind).toBe("step_up");
    // Default onExpensive true: an expensive 4G link may step up.
    expect(run(make({ target: "360", cond: { networkKey: "cellular_4g", expensive: true } }), now + 120_000).d?.kind).toBe("step_up");
  });

  it("rate 2x accrues no smooth time and never steps up; rate 0.5 neither", () => {
    expect(run(make({ target: "360", cond: { rate: 2 } }), now + 120_000).d).toBeNull();
    expect(run(make({ target: "360", cond: { rate: 0.5 } }), now + 120_000).d).toBeNull();
  });

  it("pausing freezes smooth time without resetting it", () => {
    const c = make({ target: "360" });
    run(c, now + 20_000);
    c.setConditions({ ...PLAYING, playing: false }, now);
    at(now + 60_000);
    expect(c.tick(now)).toBeNull();
    c.setConditions(PLAYING, now);
    const start = now;
    const { at: when } = run(c, now + 60_000);
    expect(when - start).toBe(10_000);
  });

  it("a counted stall resets smooth time", () => {
    const c = make({ target: "360" });
    run(c, now + 20_000);
    c.stallStarted(now);
    c.stallEnded(now + 300);
    at(now + 300);
    const start = now;
    const { at: when } = run(c, now + 60_000);
    expect(when - start).toBe(30_000);
  });

  it("a network key change resets smooth time", () => {
    const c = make({ target: "360" });
    run(c, now + 20_000);
    c.setConditions({ ...PLAYING, networkKey: "ethernet" }, now);
    const start = now;
    const { at: when } = run(c, now + 60_000);
    expect(when - start).toBe(30_000);
  });

  it("needs 90 s after a step-down in this session (hysteresis), and 15 s dwell after any landing", () => {
    const c = make();
    at(now + 5000);
    c.stallStarted(now);
    const { d } = run(c, now + 2000);
    c.switchIssued(d!, now);
    c.stallEnded(now);
    now += 500;
    c.switchLanded(BOTH, now);
    const landed = now;
    const up = run(c, now + 200_000);
    expect(up.d?.kind).toBe("step_up");
    expect(up.at - landed).toBe(90_000);
  });

  it("step-up dwell: no step-up within stepUp.cooldownMs of a landing even with smooth time", () => {
    const s = settings((x) => {
      x.stepUp.smoothMs = 5000;
      x.stepUp.smoothMsAfterStepDown = 5000;
      x.stepUp.cooldownMs = 15000;
    });
    const c = make({ target: "360", settings: s });
    const start = now;
    const { at: when } = run(c, now + 60_000);
    expect(when - start).toBe(15_000);
  });

  it("relapse: a step-down within 60 s of a step-up landing locks the session low", () => {
    const c = make({ target: "360" });
    const { d: up } = run(c, now + 60_000);
    apply(c, up!);
    // Stall right after the cooldown: a step-down within the relapse window.
    at(now + 3000);
    c.stallStarted(now);
    const { d: down } = run(c, now + 2000);
    expect(down?.kind).toBe("step_down");
    c.switchIssued(down!, now);
    expect(c.state.lockedLow).toBe(true);
    c.stallEnded(now);
    now += 500;
    c.switchLanded(BOTH, now);
    expect(run(c, now + 600_000).d).toBeNull();
  });

  it("no relapse lock when the step-down comes after the window", () => {
    const c = make({ target: "360" });
    const { d: up } = run(c, now + 60_000);
    apply(c, up!);
    run(c, now + 61_000);
    c.stallStarted(now);
    const { d: down } = run(c, now + 2000);
    c.switchIssued(down!, now);
    expect(c.state.lockedLow).toBe(false);
  });

  it("available false for 720 blocks a step-up", () => {
    expect(run(make({ target: "360", available: { "720": false, "360": true } }), now + 120_000).d).toBeNull();
  });
});

describe("QualityController cap", () => {
  it("cap reached after 4 switches; a step-up is refused when only one switch remains", () => {
    const s = settings((x) => {
      x.stepUp.smoothMsAfterStepDown = 30000;
      x.relapse.windowMs = 0;
    });
    const c = make({ target: "720", settings: s });
    const stallDown = () => {
      at(now + 3000);
      c.stallStarted(now);
      const r = run(c, now + 2000);
      c.stallEnded(now);
      return r.d;
    };
    const d1 = stallDown();
    expect(d1?.kind).toBe("step_down");
    apply(c, d1!);
    const u1 = run(c, now + 200_000).d;
    expect(u1?.kind).toBe("step_up");
    apply(c, u1!);
    const d2 = stallDown();
    expect(d2?.kind).toBe("step_down");
    apply(c, d2!);
    expect(c.state.switches).toBe(3);
    // switches + 2 > 4: no step-up, the last switch is kept for a step-down.
    expect(run(c, now + 600_000).d).toBeNull();
    expect(c.level).toBe("360");
    expect(c.state).toMatchObject({ switches: 3, stepDowns: 2, stepUps: 1, capReached: false, steppedDownOnce: true });
  });

  it("capReached at maxSwitchesPerSession; nothing more is decided", () => {
    const s = settings((x) => (x.maxSwitchesPerSession = 1));
    const c = make({ settings: s });
    at(now + 3000);
    c.stallStarted(now);
    const { d } = run(c, now + 2000);
    c.switchIssued(d!, now);
    expect(c.state.capReached).toBe(true);
    c.switchLanded(BOTH, now + 100);
    expect(run(c, now + 600_000).d).toBeNull();
  });

  it("a 360 start may step up only when two switches remain", () => {
    const s = settings((x) => (x.maxSwitchesPerSession = 1));
    expect(run(make({ target: "360", settings: s }), now + 120_000).d).toBeNull();
  });
});

describe("QualityController angle changes", () => {
  it("angleChanged resets the stall log and smooth time, keeps level and counts", () => {
    const c = make();
    at(now + 5000);
    c.stallStarted(now);
    c.stallEnded(now + 100);
    at(now + 1000);
    c.angleChanged({ "720": true, "360": true }, now);
    at(now + 3000);
    // One stall after the angle change is not a repeat.
    expect(c.stallStarted(now)).toBeNull();
    expect(c.stallEnded(now + 100)).toBeNull();
    expect(c.level).toBe("720");

    const up = make({ target: "360" });
    run(up, now + 20_000);
    up.angleChanged({ "720": true, "360": true }, now);
    const start = now;
    const { at: when } = run(up, now + 60_000);
    // Both the smooth time (30 s) and the dwell after the landing (15 s) restart.
    expect(when - start).toBe(30_000);
  });

  it("angleChanged records the new angle's availability", () => {
    const c = make();
    c.angleChanged({ "720": true, "360": false }, now);
    at(now + 5000);
    c.stallStarted(now);
    expect(run(c, now + 5000).d).toBeNull();
  });

  it("switchFailed keeps the level at d.to and the switch counted", () => {
    const c = make({ target: "360" });
    const { d } = run(c, now + 60_000);
    c.switchIssued(d!, now);
    c.switchFailed(now + 10);
    expect(c.level).toBe("720");
    expect(c.state).toMatchObject({ switches: 1, stepUps: 1 });
  });
});

/**
 * Owner requirement 2026-10-06: the level is the SERVED rendition, so an old
 * match missing a copy only ever moves between copies that exist.
 */
describe("QualityController follows the served rendition", () => {
  type Avail = { "720": boolean; "360": boolean };
  // [name, availability, served for a 720 target, served for a 360 target]
  const ROWS: Array<[string, Avail, "720" | "360" | "original", "720" | "360" | "original"]> = [
    ["720+360", { "720": true, "360": true }, "720", "360"],
    ["720 only", { "720": true, "360": false }, "720", "720"],
    ["360 only", { "720": false, "360": true }, "360", "360"],
    ["original only", { "720": false, "360": false }, "original", "original"],
  ];
  const PREFS: Array<[QualityPreference, TargetRendition]> = [
    ["auto", "720"],
    ["auto", "360"],
    ["high", "720"],
    ["data_saver", "360"],
  ];

  /** Stall long, then play smooth for 10 minutes: every decision made. */
  function exercise(c: QualityController): QualityDecision[] {
    const out: QualityDecision[] = [];
    at(now + 5000);
    c.stallStarted(now);
    let r = run(c, now + 3000);
    if (r.d) {
      out.push(r.d);
      c.switchIssued(r.d, now);
      c.stallEnded(now);
      return out;
    }
    c.stallEnded(now);
    r = run(c, now + 600_000);
    if (r.d) out.push(r.d);
    return out;
  }

  for (const [rowName, avail, served720, served360] of ROWS) {
    for (const [pref, target] of PREFS) {
      const served = target === "720" ? served720 : served360;
      it(`${rowName}, ${pref} targeting ${target}: served ${served}`, () => {
        const c = make({ preference: pref, target, available: avail });
        c.sourceAttached(served, avail, now);
        if (served !== "original") expect(c.level).toBe(served);
        expect(c.target).toBe(target);
        const decisions = exercise(c);
        if (pref !== "auto" || served === "original") {
          expect(decisions).toEqual([]);
          expect(c.state.switches).toBe(0);
          return;
        }
        for (const d of decisions) {
          // Never a swap to a copy that does not exist or is already on screen.
          expect(avail[d.to]).toBe(true);
          expect(d.from).toBe(served);
          expect(d.to).not.toBe(served);
        }
        if (served === "720" && avail["360"]) expect(decisions.map((d) => d.kind)).toEqual(["step_down"]);
        else if (served === "360" && avail["720"]) expect(decisions.map((d) => d.kind)).toEqual(["step_up"]);
        else expect(decisions).toEqual([]);
      });
    }
  }

  it("Auto targeting 360 served as 720 sits at 720 and never steps up", () => {
    const avail = { "720": true, "360": false };
    const c = make({ target: "360", available: avail });
    c.sourceAttached("720", avail, now);
    expect(c.level).toBe("720");
    expect(run(c, now + 600_000).d).toBeNull();
    expect(c.target).toBe("360");
  });

  it("an angle switch from both copies to the original only and back", () => {
    const both = { "720": true, "360": true };
    const none = { "720": false, "360": false };
    const c = make({ available: both });
    c.sourceAttached("720", both, now);
    // Angle B has only the original: inert.
    at(now + 1000);
    c.angleChanged(none, now, "original");
    at(now + 5000);
    c.stallStarted(now);
    expect(run(c, now + 5000).d).toBeNull();
    c.stallEnded(now);
    expect(c.state.switches).toBe(0);
    // Back to angle A: decisions resume from what it serves.
    c.angleChanged(both, now, "720");
    expect(c.level).toBe("720");
    at(now + 5000);
    c.stallStarted(now);
    const { d } = run(c, now + 3000);
    expect(d).toEqual({ kind: "step_down", from: "720", to: "360", reason: "stall_long" });
  });

  it("after a step-down, an angle with only 720 serves 720: level follows, target stays 360", () => {
    const both = { "720": true, "360": true };
    const c = make({ available: both });
    c.sourceAttached("720", both, now);
    at(now + 5000);
    c.stallStarted(now);
    const { d } = run(c, now + 3000);
    c.switchIssued(d!, now);
    c.stallEnded(now);
    c.switchLanded(both, now + 300, "360");
    c.angleChanged({ "720": true, "360": false }, now + 1000, "720");
    expect(c.level).toBe("720");
    expect(c.target).toBe("360");
    expect(run(c, now + 600_000).d).toBeNull();
  });

  it("a landing that resolved to another copy than asked takes the served one", () => {
    const both = { "720": true, "360": true };
    const c = make({ available: both });
    at(now + 5000);
    c.stallStarted(now);
    const { d } = run(c, now + 3000);
    c.switchIssued(d!, now);
    // The 360 copy vanished between the read and the swap (fallback to 720).
    c.switchLanded({ "720": true, "360": false }, now + 300, "720");
    expect(c.level).toBe("720");
  });
});
