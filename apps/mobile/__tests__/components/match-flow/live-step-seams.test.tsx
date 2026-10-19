/**
 * The live step's seams (timekeeper mode ARCHITECTURE 2.3, PR3), on the real
 * step: the ended plate names the opponent by default and `endedByName` when
 * given; `controls` "none" takes the pause and end controls off this phone
 * and shows `controlsStrip` instead.
 */
import * as React from "react";
import { Text } from "react-native";
import { act, render } from "@testing-library/react-native";

jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
jest.mock("@jits/shared/api/mutations", () => ({ pauseMatch: jest.fn(), resumeMatch: jest.fn() }));
jest.mock("@jits/shared/api/queries", () => ({ getMatchDetails: jest.fn() }));

const mockSyncParams: { current: { onMatchEnded?: () => void } | null } = { current: null };
jest.mock("@jits/shared/hooks/use-session-match-sync", () => ({
  useSessionMatchSync: (params: { onMatchEnded?: () => void }) => {
    mockSyncParams.current = params;
    return {
      broadcastMatchEnded: () => Promise.resolve("ok"),
      broadcastTimerPaused: () => Promise.resolve("ok"),
      broadcastTimerResumed: () => Promise.resolve("ok"),
    };
  },
}));
jest.mock("@/lib/match-flow/use-haptics", () => ({
  matchHaptics: { matchStart: () => Promise.resolve(), matchEnd: () => Promise.resolve(), timeWarning: () => Promise.resolve() },
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/components/ui/toast", () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));
jest.mock("@/lib/theme/use-theme", () => ({
  useThemedTokens: () => ({ textPrimary: "#E8EDF2", textOnAccent: "#FFFFFF", accentCta: "#E5484D" }),
  useResolvedColorScheme: () => "dark",
}));
jest.mock("lucide-react-native", () => {
  const RN = require("react-native");
  const R = require("react");
  const stub = () => R.createElement(RN.View, { testID: "icon" });
  return new Proxy({}, { get: (_t: Record<string, unknown>, prop: string) => (prop === "__esModule" ? true : stub) });
});

import { LiveStep, type LiveStepProps } from "@/components/match-flow/steps/live-step";
import type { UseVideoRecorderReturn } from "@/lib/video/use-video-recorder";

const NOW = Date.parse("2026-10-19T12:00:00.000Z");

function renderLive(extra: Partial<LiveStepProps> = {}) {
  const recorder = {
    state: "idle",
    error: null,
    requestPermission: jest.fn(() => Promise.resolve()),
    permission: { granted: false, canAskAgain: true },
    start: jest.fn(() => Promise.resolve()),
    stop: jest.fn(() => Promise.resolve()),
  } as unknown as UseVideoRecorderReturn;
  return render(
    <LiveStep
      matchId="M1"
      me={{ displayName: "Kai Reyes", currentElo: 1512, weightLbs: 170 }}
      opponent={{ displayName: "Mina Park", currentElo: 1498, weightLbs: 168 }}
      durationSeconds={300}
      startedAt={new Date(NOW - 60_000).toISOString()}
      pausedAt={null}
      totalPausedDuration={0}
      recorder={recorder}
      onEnded={jest.fn()}
      {...extra}
    />,
  );
}

beforeEach(() => {
  jest.useFakeTimers({ now: NOW });
  mockSyncParams.current = null;
});
afterEach(() => jest.useRealTimers());

describe("ended by", () => {
  it("names the opponent by default when match_ended arrives", () => {
    const s = renderLive();
    act(() => mockSyncParams.current?.onMatchEnded?.());
    s.getByText("MINA PARK ENDED THE MATCH");
  });

  it("names whoever endedByName says", () => {
    const s = renderLive({ endedByName: "Jamal Cruz" });
    act(() => mockSyncParams.current?.onMatchEnded?.());
    s.getByText("JAMAL CRUZ ENDED THE MATCH");
    expect(s.queryByText("MINA PARK ENDED THE MATCH")).toBeNull();
  });
});

describe("controls", () => {
  it("full by default: Pause and Hold to end", () => {
    const s = renderLive();
    s.getByTestId("live-pause-toggle");
    s.getByTestId("live-end");
  });

  it("none: no controls on this phone, the strip in their place", () => {
    const s = renderLive({ controls: "none", controlsStrip: <Text>J. CRUZ RUNS THE CLOCK</Text> });
    expect(s.queryByTestId("live-pause-toggle")).toBeNull();
    expect(s.queryByTestId("live-end")).toBeNull();
    s.getByText("J. CRUZ RUNS THE CLOCK");
  });
});
