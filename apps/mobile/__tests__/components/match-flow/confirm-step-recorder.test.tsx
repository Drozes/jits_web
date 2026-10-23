/**
 * The confirm step's recorder seam (timekeeper mode ARCHITECTURE 2.3, PR3).
 * Omitted, the kicker reads as today: "RESULT RECORDED" until the opponent's
 * confirmation shows, then "RESULT RECORDED BY {OPP}" (the recorder is
 * auto-confirmed server-side). Given, it names `recorderName` from the start,
 * whatever the opponent's confirmation says.
 */
import * as React from "react";
import { render } from "@testing-library/react-native";
import { resetLockSecondsCache } from "@/lib/match-flow/use-dispute-locks-at";

jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
jest.mock("@/components/ui/toast", () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));
jest.mock("@/lib/theme/use-theme", () => ({
  useThemedTokens: () => ({ textSecondary: "#aaa", statePositive: "#0f0", textOnAccent: "#000" }),
  useResolvedColorScheme: () => "dark",
}));
jest.mock("lucide-react-native", () => {
  const RN = require("react-native");
  const R = require("react");
  const stub = () => R.createElement(RN.View, { testID: "icon" });
  return new Proxy({}, { get: (_t: Record<string, unknown>, prop: string) => (prop === "__esModule" ? true : stub) });
});
jest.mock("@/lib/match-flow/use-haptics", () => ({ matchHaptics: { error: jest.fn(), resultRecorded: jest.fn() } }));
jest.mock("@jits/shared/api/mutations", () => ({ confirmMatchResult: jest.fn(), disputeMatchResult: jest.fn() }));
jest.mock("@jits/shared/api/queries", () => ({ getMatchResultLockSeconds: jest.fn(async () => 86_400) }));
jest.mock("@/lib/network/mutation-queue", () => ({
  mutationQueue: { enqueue: (_k: string, fn: () => unknown) => fn() },
  isQueuedResult: () => false,
}));
jest.mock("@/lib/match-flow/match-sync-context", () => ({
  SEND_GRACE_MS: 1_500,
  useMatchSyncContext: () => ({ reconcileNow: jest.fn() }),
  useStepMatchSync: () => ({
    broadcastResultConfirmed: jest.fn(() => Promise.resolve()),
    broadcastMatchDisputed: jest.fn(() => Promise.resolve()),
  }),
}));

import { ConfirmStep } from "@/components/match-flow/steps/confirm-step";

function renderStep(overrides: Partial<React.ComponentProps<typeof ConfirmStep>> = {}) {
  return render(
    <ConfirmStep
      matchId="M1"
      me={{ athleteId: "me-1", displayName: "Mina Park" }}
      opponent={{ athleteId: "opp-1", displayName: "Demo Red" }}
      resultData={{ result: "submission", winnerId: "me-1" }}
      confirmedAthleteIds={[]}
      submissionName={null}
      finishTimeSeconds={null}
      disputeLocksAt={null}
      onCompleted={jest.fn()}
      {...overrides}
    />,
  );
}

beforeEach(() => resetLockSecondsCache());

it("omitted: no name until the opponent's confirmation shows, then the opponent", () => {
  renderStep().getByText("RESULT RECORDED");
  renderStep({ confirmedAthleteIds: ["opp-1"] }).getByText("RESULT RECORDED BY D. RED");
});

it("given: names the recorder from the start, whatever the opponent's confirmation says", () => {
  const before = renderStep({ recorderName: "Jamal Cruz" });
  before.getByText("RESULT RECORDED BY J. CRUZ");
  expect(before.queryByText("RESULT RECORDED")).toBeNull();
  renderStep({ recorderName: "Jamal Cruz", confirmedAthleteIds: ["opp-1"] }).getByText("RESULT RECORDED BY J. CRUZ");
});
