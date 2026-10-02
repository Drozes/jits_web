/**
 * Arena tempo (Adding Flare [09.4], adapted): the lobby bucket, the ONE
 * shared clock and the LIVE dots that read it.
 */
import * as React from "react";
import { act, render } from "@testing-library/react-native";
import { AppState, type AppStateStatus } from "react-native";

jest.mock("react-native-reanimated", () => require("react-native-reanimated/mock"));

import {
  __resetArenaTempoForTests,
  getTempoClock,
  getTempoPeriod,
  isTempoClockRunning,
  othersLive,
  publishTempoOthersLive,
  pulseLevel,
  tempoBucket,
  useArenaTempo,
  type ArenaTempo,
} from "@/lib/arena/arena-tempo";
import { LiveDot } from "@/components/ui/elo-system/live-pill";
import { HeaderLiveDot } from "@/components/layout/header-live-dot";
import { IDLE_ARENA_STATE, publishArenaState } from "@/lib/arena/arena-store";
import { tempo, __setReduceMotionForTests, __resetAppActiveForTests } from "@/lib/motion";

let appStateListeners: Array<(s: AppStateStatus) => void> = [];
function emitAppState(s: AppStateStatus) {
  for (const l of [...appStateListeners]) l(s);
}

beforeEach(() => {
  __resetArenaTempoForTests();
  __setReduceMotionForTests(false);
  __resetAppActiveForTests();
  appStateListeners = [];
  Object.defineProperty(AppState, "currentState", { value: "active", configurable: true, writable: true });
  jest.spyOn(AppState, "addEventListener").mockImplementation(((
    _type: string,
    l: (s: AppStateStatus) => void,
  ) => {
    appStateListeners.push(l);
    return { remove: () => (appStateListeners = appStateListeners.filter((x) => x !== l)) };
  }) as never);
});

afterEach(() => {
  jest.restoreAllMocks();
  publishArenaState(IDLE_ARENA_STATE);
});

function Probe({ enabled = true, onTempo }: { enabled?: boolean; onTempo: (t: ArenaTempo) => void }) {
  onTempo(useArenaTempo(enabled));
  return null;
}

/** Flat style of a host node (the mock's useAnimatedStyle returns plain objects). */
function flatStyle(node: { props: { style?: unknown } }): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const walk = (s: unknown) => {
    if (Array.isArray(s)) s.forEach(walk);
    else if (s && typeof s === "object") Object.assign(out, s);
  };
  walk(node.props.style);
  return out;
}

function scaleOf(style: Record<string, unknown>): number | undefined {
  const t = style.transform as { scale?: number }[] | undefined;
  return t?.find((x) => x.scale !== undefined)?.scale;
}

describe("tempo buckets", () => {
  it("buckets others live: quiet 0 to 2, normal 3 to 9, busy 10+", () => {
    expect(tempoBucket(0)).toBe("quiet");
    expect(tempoBucket(2)).toBe("quiet");
    expect(tempoBucket(3)).toBe("normal");
    expect(tempoBucket(9)).toBe("normal");
    expect(tempoBucket(10)).toBe("busy");
    expect(tempoBucket(40)).toBe("busy");
  });

  it("leaves self out of the lobby count", () => {
    expect(othersLive(new Set(["me", "a", "b"]), "me")).toBe(2);
    expect(othersLive(new Set(["a", "b"]), "me")).toBe(2);
    expect(othersLive(new Set(["a"]), null)).toBe(1);
  });

  it("follows the published lobby and sets the shared period", () => {
    let seen: ArenaTempo | null = null;
    render(<Probe onTempo={(t) => (seen = t)} />);
    expect(seen!.bucket).toBe("quiet");
    expect(getTempoPeriod()).toBe(tempo.quiet);

    act(() => publishTempoOthersLive(4));
    expect(seen!.bucket).toBe("normal");
    expect(seen!.periodMs).toBe(tempo.normal);
    expect(getTempoPeriod()).toBe(tempo.normal);

    act(() => publishTempoOthersLive(12));
    expect(seen!.bucket).toBe("busy");
    expect(getTempoPeriod()).toBe(tempo.busy);

    // A channel loss reads quiet (nothing known).
    act(() => publishTempoOthersLive(0));
    expect(seen!.bucket).toBe("quiet");
  });

  it("does not re-render on a presence sync that keeps the bucket", () => {
    let renders = 0;
    render(<Probe onTempo={() => (renders += 1)} />);
    const before = renders;
    act(() => publishTempoOthersLive(1));
    act(() => publishTempoOthersLive(2));
    expect(renders).toBe(before);
  });

  it("a bucket change keeps the clock running (eases, never stops)", () => {
    render(<Probe onTempo={() => undefined} />);
    expect(isTempoClockRunning()).toBe(true);
    act(() => publishTempoOthersLive(15));
    expect(isTempoClockRunning()).toBe(true);
  });
});

describe("the shared clock", () => {
  it("is one value for every consumer", () => {
    const seen: ArenaTempo[] = [];
    render(
      <>
        <Probe onTempo={(t) => seen.push(t)} />
        <Probe onTempo={(t) => seen.push(t)} />
      </>,
    );
    expect(seen.every((t) => t.clock === getTempoClock())).toBe(true);
  });

  it("runs while held and stops when the last holder leaves", () => {
    const a = render(<Probe onTempo={() => undefined} />);
    const b = render(<Probe onTempo={() => undefined} />);
    expect(isTempoClockRunning()).toBe(true);
    a.unmount();
    expect(isTempoClockRunning()).toBe(true);
    b.unmount();
    expect(isTempoClockRunning()).toBe(false);
  });

  it("is not held while the consumer's state is false", () => {
    let seen: ArenaTempo | null = null;
    render(<Probe enabled={false} onTempo={(t) => (seen = t)} />);
    expect(seen!.animate).toBe(false);
    expect(isTempoClockRunning()).toBe(false);
  });

  it("is not held under Reduce Motion", () => {
    __setReduceMotionForTests(true);
    let seen: ArenaTempo | null = null;
    render(<Probe onTempo={(t) => (seen = t)} />);
    expect(seen!.animate).toBe(false);
    expect(isTempoClockRunning()).toBe(false);
  });

  it("pauses in the background and restarts on foreground", () => {
    render(<Probe onTempo={() => undefined} />);
    expect(isTempoClockRunning()).toBe(true);
    act(() => emitAppState("background"));
    expect(isTempoClockRunning()).toBe(false);
    act(() => emitAppState("active"));
    expect(isTempoClockRunning()).toBe(true);
  });

  it("pulse level: rest at the cycle edges, full at the middle", () => {
    expect(pulseLevel(0)).toBe(0);
    expect(pulseLevel(1)).toBe(0);
    expect(pulseLevel(0.5)).toBe(1);
    expect(pulseLevel(0.25)).toBeCloseTo(0.5);
  });
});

describe("LIVE dots read the shared clock", () => {
  it("LiveDot breathes with the clock phase", () => {
    const r = render(<LiveDot testID="dot" />);
    act(() => {
      getTempoClock().value = 0.5;
    });
    r.rerender(<LiveDot testID="dot" />);
    const style = flatStyle(r.getByTestId("dot", { includeHiddenElements: true }));
    expect(style.opacity).toBeCloseTo(0.45);
    expect(scaleOf(style)).toBeCloseTo(0.8);
  });

  it("LiveDot is a static dot under Reduce Motion", () => {
    __setReduceMotionForTests(true);
    const r = render(<LiveDot testID="dot" />);
    act(() => {
      getTempoClock().value = 0.5;
    });
    r.rerender(<LiveDot testID="dot" />);
    const style = flatStyle(r.getByTestId("dot", { includeHiddenElements: true }));
    expect(style.opacity).toBe(1);
    expect(scaleOf(style)).toBe(1);
    expect(isTempoClockRunning()).toBe(false);
  });

  it("the header live dot pulses in phase with LiveDot, and holds the clock only while live", () => {
    const r = render(
      <>
        <HeaderLiveDot />
        <LiveDot testID="dot" />
      </>,
    );
    expect(r.queryByTestId("header-live-dot")).toBeNull();
    act(() => publishArenaState({ ...IDLE_ARENA_STATE, isLive: true }));
    act(() => {
      getTempoClock().value = 0.5;
    });
    r.rerender(
      <>
        <HeaderLiveDot />
        <LiveDot testID="dot" />
      </>,
    );
    const header = flatStyle(r.getByTestId("header-live-dot-mark"));
    const dot = flatStyle(r.getByTestId("dot", { includeHiddenElements: true }));
    expect(header.opacity).toBeCloseTo(dot.opacity as number);
    expect(scaleOf(header)).toBeCloseTo(scaleOf(dot) as number);
  });

  it("the header live dot is static under Reduce Motion", () => {
    __setReduceMotionForTests(true);
    publishArenaState({ ...IDLE_ARENA_STATE, isLive: true });
    const r = render(<HeaderLiveDot />);
    act(() => {
      getTempoClock().value = 0.5;
    });
    r.rerender(<HeaderLiveDot />);
    const style = flatStyle(r.getByTestId("header-live-dot-mark"));
    expect(style.opacity).toBe(1);
  });
});
