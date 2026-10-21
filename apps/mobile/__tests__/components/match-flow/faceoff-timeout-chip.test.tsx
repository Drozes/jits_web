/**
 * TK-D9 `NO CONTEST IN {m:ss}` (timekeeper mode A26; COPY-DECK Rounds 4 and
 * 5; slice M3 owns `timeout-chip.tsx`, M4 only renders it while paused): the
 * countdown to the timekeeper-mode state's `timeout_at`, the instant the
 * server's sweep makes the match a no contest. On the face-off of all three
 * roles from the seat, and during a pause; never in a two-athlete match.
 */
import * as React from "react";
import { act, render } from "@testing-library/react-native";

jest.mock("lucide-react-native", () => {
  const RN = require("react-native");
  const R = require("react");
  return new Proxy({}, { get: (_t: Record<string, unknown>, p: string) => (p === "__esModule" ? true : () => R.createElement(RN.View, { testID: `icon-${p}` })) });
});
jest.mock("@/lib/supabase/client", () => ({ supabase: { tag: "client" } }));
jest.mock("@/components/ui/toast", () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));
jest.mock("expo-router", () => ({ useRouter: () => ({ dismissTo: jest.fn(), push: jest.fn(), back: jest.fn() }) }));
jest.mock("@jits/shared/api/queries", () => ({ getMatchDetails: jest.fn() }));
jest.mock("@jits/shared/api/mutations", () => ({ cancelSessionMatch: jest.fn(), startMatch: jest.fn() }));
jest.mock("@jits/shared/api/match-video-upload", () => ({
  setMatchRecordingIntent: jest.fn(async () => ({ ok: true, data: null })),
}));
jest.mock("@/lib/invites/location", () => ({
  ...jest.requireActual("@/lib/invites/location"),
  readLocationOnce: jest.fn(async () => ({ status: "denied", canAskAgain: true })),
}));
jest.mock("@/lib/arena/location-telemetry", () => ({ logMatchStartLocation: jest.fn() }));
jest.mock("@jits/shared/hooks/use-session-match-sync", () => ({
  useSessionMatchSync: () => new Proxy({}, { get: () => () => Promise.resolve("ok") }),
}));

import { FaceoffProvider } from "@/components/match-flow/faceoff/faceoff-context";
import { FaceoffTop } from "@/components/match-flow/faceoff/faceoff-top";
import { FaceoffTimekeeperTop } from "@/components/match-flow/faceoff/faceoff-timekeeper";
import { TimeoutChip } from "@/components/match-flow/faceoff/timeout-chip";
import { MatchFlowProvider } from "@/lib/match-flow/match-flow-context";
import { TIMEKEEPER_COPY as C } from "@/lib/match-flow/timekeeper-copy";
import { __resetAiConsentForTests } from "@/lib/moderation/ai-consent";
import { CH, OP, TK, timekeeperFaceoffProps, tkFlow, tkState } from "../../support/timekeeper-faceoff";

const NOW = new Date("2026-10-21T12:00:00.000Z");
/** The seat was at 11:58:30: the face-off timeout fires at 12:08:30. */
const FACEOFF_TIMEOUT = "2026-10-21T12:08:30.000Z";

async function tick(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(NOW);
  __resetAiConsentForTests({ athleteId: OP, consentAt: "2026-10-14T12:00:00Z", known: true });
});
afterEach(() => {
  jest.useRealTimers();
});

describe("the chip", () => {
  it("counts down to timeout_at once a second, in m:ss, and speaks it (TK-D9)", async () => {
    const s = render(<TimeoutChip timeoutAt={FACEOFF_TIMEOUT} />);
    expect(s.getByTestId("timeout-chip-text").props.children).toBe("NO CONTEST IN 8:30");
    expect(s.getByTestId("timeout-chip").props.accessibilityLabel).toBe(C["TK-D9"].a11y(510));
    expect(s.getByTestId("timeout-chip").props.accessibilityLabel).toBe("Match ends as no contest in 8 minutes 30 seconds");
    await tick(1_000);
    expect(s.getByTestId("timeout-chip-text").props.children).toBe("NO CONTEST IN 8:29");
    await tick(60_000);
    expect(s.getByTestId("timeout-chip-text").props.children).toBe("NO CONTEST IN 7:29");
  });

  it("stops at 0:00 (the server's sweep, not the chip, ends the match)", async () => {
    const s = render(<TimeoutChip timeoutAt="2026-10-21T12:00:03.000Z" />);
    await tick(10_000);
    expect(s.getByTestId("timeout-chip-text").props.children).toBe("NO CONTEST IN 0:00");
  });

  it("renders nothing without an instant (a two-athlete match, or no seat yet)", () => {
    expect(render(<TimeoutChip timeoutAt={null} />).toJSON()).toBeNull();
    expect(render(<TimeoutChip timeoutAt="not a time" />).toJSON()).toBeNull();
  });

  it("follows a new timeout_at (a pause: the pause timeout replaces the face-off one)", async () => {
    const s = render(<TimeoutChip timeoutAt={FACEOFF_TIMEOUT} />);
    // While paused the state's timeout_at is paused_at + 10 min (slice M4 renders this chip then).
    s.rerender(<TimeoutChip timeoutAt="2026-10-21T12:10:00.000Z" />);
    expect(s.getByTestId("timeout-chip-text").props.children).toBe("NO CONTEST IN 10:00");
    await tick(2_000);
    expect(s.getByTestId("timeout-chip-text").props.children).toBe("NO CONTEST IN 9:58");
  });
});

describe("on the face-off, all three roles, from the seat", () => {
  function AthleteTop({ viewer, timeoutAt }: { viewer: string; timeoutAt: string | null }) {
    const flow = tkFlow(viewer, { state: tkState({ timeoutAt }) });
    const me = flow.roles.me!;
    const opponent = flow.roles.opponent!;
    return (
      <FaceoffProvider
        active
        phase="weight"
        matchId="M1"
        exitHref="/arena"
        meId={me.athleteId}
        opponentId={opponent.athleteId}
        myWeight={170}
        opponentWeight={167}
        weightsRated
        onWeighedIn={jest.fn()}
        onStarted={jest.fn()}
        onCancelledRemotely={jest.fn()}
        flow={flow}
      >
        <FaceoffTop phase="weight" me={me} opponent={opponent} />
      </FaceoffProvider>
    );
  }

  it.each([
    ["the challenger", CH],
    ["the opponent", OP],
  ])("%s sees it under the face-off bar", async (_who, viewer) => {
    const s = render(<AthleteTop viewer={viewer} timeoutAt={FACEOFF_TIMEOUT} />);
    await tick(0);
    expect(s.getByTestId("timeout-chip-text").props.children).toBe("NO CONTEST IN 8:30");
  });

  it("the timekeeper sees it in their header", async () => {
    const flow = tkFlow(TK, { state: tkState({ timeoutAt: FACEOFF_TIMEOUT }) });
    const s = render(
      <MatchFlowProvider match={flow.match} roles={flow.roles} tkState={flow.tkState}>
        <FaceoffProvider {...timekeeperFaceoffProps(flow)}>
          <FaceoffTimekeeperTop />
        </FaceoffProvider>
      </MatchFlowProvider>,
    );
    expect(s.getByTestId("timeout-chip-text").props.children).toBe("NO CONTEST IN 8:30");
  });

  it("an athlete before the state names the timeout sees no chip", async () => {
    const s = render(<AthleteTop viewer={OP} timeoutAt={null} />);
    await tick(0);
    expect(s.queryByTestId("timeout-chip")).toBeNull();
  });

  it("a two-athlete face-off never shows it", async () => {
    const s = render(
      <FaceoffProvider
        active
        phase="weight"
        matchId="M1"
        exitHref="/arena"
        meId="me-1"
        opponentId="opp-1"
        myWeight={170}
        opponentWeight={167}
        weightsRated
        onWeighedIn={jest.fn()}
        onStarted={jest.fn()}
        onCancelledRemotely={jest.fn()}
      >
        <FaceoffTop
          phase="weight"
          me={{ displayName: "Kai Reyes", currentElo: 1512 }}
          opponent={{ displayName: "Mina Park", currentElo: 1498 }}
        />
      </FaceoffProvider>,
    );
    await tick(0);
    expect(s.queryByTestId("timeout-chip")).toBeNull();
  });
});
