/**
 * The countdown and live-stage seams (timekeeper mode ARCHITECTURE 2.3, PR3):
 * the countdown's caption is an input whose default is today's two-phone
 * caption, and the live step's seams (controls, their strip, the ended-by
 * name) pass through the stage unchanged.
 */
import * as React from "react";
import { Text } from "react-native";
import { render } from "@testing-library/react-native";

jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("expo-router", () => ({ useRouter: () => ({ dismissTo: jest.fn() }) }));
jest.mock("@/lib/match-flow/use-haptics", () => ({
  matchHaptics: { countdownTick: () => Promise.resolve(), countdownGo: () => Promise.resolve(), matchStart: () => Promise.resolve() },
}));
const mockLiveProps = jest.fn();
jest.mock("@/components/match-flow/steps/live-step", () => ({
  LiveStep: (p: Record<string, unknown>) => {
    mockLiveProps(p);
    const R = require("react");
    const RN = require("react-native");
    return R.createElement(RN.View, { testID: "live-step" });
  },
}));
jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: () => ({ width: 390, height: 844, scale: 3, fontScale: 1 }),
}));

import { COUNTDOWN_CAPTION, COUNTDOWN_MS } from "@/components/match-flow/countdown/countdown";
import { LiveStage } from "@/components/match-flow/countdown/live-stage";

const NOW = Date.parse("2026-10-19T12:00:00.000Z");
const who = (name: string) => ({ displayName: name, currentElo: 1500, weightLbs: 170 });

function renderStage(startedAtMs: number, extra: Partial<React.ComponentProps<typeof LiveStage>> = {}) {
  return render(
    <LiveStage
      matchId="M1"
      me={who("Kai Reyes")}
      opponent={who("Mina Park")}
      durationSeconds={600}
      startedAt={new Date(startedAtMs).toISOString()}
      pausedAt={null}
      totalPausedDuration={0}
      recorder={{} as never}
      recording
      myWeight={170}
      opponentWeight={168}
      onEnded={jest.fn()}
      {...extra}
    />,
  );
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
  jest.clearAllMocks();
});
afterEach(() => jest.useRealTimers());

describe("countdown caption", () => {
  it("defaults to today's two-phone caption", () => {
    expect(COUNTDOWN_CAPTION).toBe("SYNCED TO SERVER CLOCK · BOTH PHONES");
    const s = renderStage(NOW);
    s.getByText(COUNTDOWN_CAPTION);
  });

  it("shows the caption it is given instead", () => {
    const s = renderStage(NOW, { countdownCaption: "SYNCED TO SERVER CLOCK · ALL PHONES" });
    s.getByText("SYNCED TO SERVER CLOCK · ALL PHONES");
    expect(s.queryByText(COUNTDOWN_CAPTION)).toBeNull();
  });
});

describe("live step seams through the stage", () => {
  it("passes nothing by default: the live step uses its own defaults", () => {
    renderStage(NOW - COUNTDOWN_MS - 5_000);
    const p = mockLiveProps.mock.calls[0][0];
    expect(p.controls).toBeUndefined();
    expect(p.controlsStrip).toBeUndefined();
    expect(p.endedByName).toBeUndefined();
  });

  it("forwards controls, the strip and the ended-by name, never the countdown caption", () => {
    const strip = <Text>J. CRUZ RUNS THE CLOCK</Text>;
    renderStage(NOW - COUNTDOWN_MS - 5_000, {
      controls: "none",
      controlsStrip: strip,
      endedByName: "Jamal Cruz",
      countdownCaption: "SYNCED TO SERVER CLOCK · ALL PHONES",
    });
    const p = mockLiveProps.mock.calls[0][0];
    expect(p.controls).toBe("none");
    expect(p.controlsStrip).toBe(strip);
    expect(p.endedByName).toBe("Jamal Cruz");
    expect(p).not.toHaveProperty("countdownCaption");
  });
});
