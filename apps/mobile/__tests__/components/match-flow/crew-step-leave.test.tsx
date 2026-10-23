/**
 * The crew step's Leave (timekeeper mode spec 4.3, "Picking"; M1 stub,
 * `useCrewLeave`): while nobody is seated an athlete's Leave confirms with
 * the shipped alert (TK-E4 only once a timekeeper is seated) and cancels the
 * match for both (`cancel_session_match`), then exits through `exitMatchTo`.
 * Android back is the same control: it confirms and cancels, and never pops
 * the route on its own (jits-bh2v).
 */
import * as React from "react";
import { Alert, BackHandler } from "react-native";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

jest.mock("lucide-react-native", () => {
  const RN = require("react-native");
  const R = require("react");
  return new Proxy({}, { get: (_t: Record<string, unknown>, p: string) => (p === "__esModule" ? true : () => R.createElement(RN.View, { testID: `icon-${p}` })) });
});
jest.mock("@/lib/supabase/client", () => ({ supabase: { tag: "client" } }));
jest.mock("@/components/ui/toast", () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));
const mockDismissTo = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ dismissTo: mockDismissTo, push: jest.fn(), back: jest.fn() }) }));
const mockCancel = jest.fn();
jest.mock("@jits/shared/api/mutations", () => ({
  cancelSessionMatch: (...a: unknown[]) => mockCancel(...a),
}));
// The picker's reads (M2), not under test here: nobody to ask, no earlier request.
jest.mock("@jits/shared/api/timekeeper", () => ({
  ...jest.requireActual("@jits/shared/api/timekeeper"),
  getTimekeeperCandidates: async () => ({ ok: true, data: { friends: [], nearby: [] } }),
  getLatestTimekeeperRequest: async () => ({ ok: true, data: null }),
}));

import type { MatchDetails } from "@jits/shared/api/queries";
import { CrewStep } from "@/components/match-flow/crew/crew-step";
import { MatchSyncProvider } from "@/lib/match-flow/match-sync-context";
import { MatchFlowProvider } from "@/lib/match-flow/match-flow-context";
import { deriveMatchRoles } from "@/lib/match-flow/match-roles";
import { toast } from "@/components/ui/toast";

const markExiting = jest.fn();
const SYNC = {
  onChannelStatus: jest.fn(),
  reconcileNow: jest.fn(),
  markExiting,
  subscribeSnapshot: () => () => {},
  noteCancelActor: jest.fn(),
  timekeeperModeSelfId: "me-1",
};

let backHandlers: (() => boolean | null | undefined)[] = [];
const removeBack = jest.fn();

const athlete = (id: string, name: string) => ({
  athlete_id: id,
  display_name: name,
  current_elo: 1500,
  current_weight: 170,
  profile_photo_url: null,
  role: "competitor",
  outcome: null,
  elo_before: null,
  elo_after: null,
  elo_delta: 0,
  weight_division_gap: null,
});

/** A timekeeper-mode match while the athletes pick (M2 renders the picker from it). */
const MATCH = {
  id: "M1",
  status: "pending",
  participants: [athlete("me-1", "Mina Park"), athlete("opp-1", "Demo Okafor")],
  challenger_id: "me-1",
  requires_timekeeper: true,
  timekeeper_id: null,
  timekeeper: null,
} as unknown as MatchDetails;

function mount() {
  return render(
    <MatchFlowProvider match={MATCH} roles={deriveMatchRoles(MATCH, "me-1")!} tkState={null}>
      <MatchSyncProvider value={SYNC}>
        <CrewStep matchId="M1" exitHref="/arena" />
      </MatchSyncProvider>
    </MatchFlowProvider>,
  );
}

/** Taps the alert's action ("Cancel Match"), or its safe button. */
function alertTaps(button: 0 | 1) {
  return jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => buttons?.[button]?.onPress?.());
}

beforeEach(() => {
  jest.clearAllMocks();
  backHandlers = [];
  jest.spyOn(BackHandler, "addEventListener").mockImplementation(((_e: string, h: () => boolean) => {
    backHandlers.push(h);
    return { remove: removeBack };
  }) as never);
});

afterEach(() => jest.restoreAllMocks());

describe("crew step Leave", () => {
  it("is labelled 'Cancel match', confirms with the shipped alert, cancels for both and exits", async () => {
    mockCancel.mockResolvedValue({ ok: true, data: {} });
    const alert = alertTaps(1);
    const s = mount();
    s.getByText("Leave");
    fireEvent.press(s.getByLabelText("Cancel match"));
    expect(alert.mock.calls[0][0]).toBe("Cancel match?");
    expect(alert.mock.calls[0][1]).toBe("Your opponent will be returned to the lobby.");
    expect(alert.mock.calls[0][2]?.map((b) => b.text)).toEqual(["Keep Waiting", "Cancel Match"]);
    await waitFor(() => expect(mockDismissTo).toHaveBeenCalledWith("/arena"));
    expect(mockCancel).toHaveBeenCalledWith(expect.anything(), "M1");
    expect(markExiting).toHaveBeenCalled();
  });

  it("Keep Waiting keeps the match", async () => {
    alertTaps(0);
    const s = mount();
    fireEvent.press(s.getByLabelText("Cancel match"));
    await act(async () => undefined);
    expect(mockCancel).not.toHaveBeenCalled();
    expect(mockDismissTo).not.toHaveBeenCalled();
  });

  it("a refused cancel stays on the step with the shipped failure toast, and Leave works again", async () => {
    mockCancel.mockResolvedValueOnce({ ok: false, error: { code: "UNKNOWN", message: "nope" } });
    const alert = alertTaps(1);
    const s = mount();
    fireEvent.press(s.getByLabelText("Cancel match"));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.objectContaining({ text1: "Could not cancel" })));
    expect(mockDismissTo).not.toHaveBeenCalled();
    mockCancel.mockResolvedValueOnce({ ok: true, data: {} });
    fireEvent.press(s.getByLabelText("Cancel match"));
    await waitFor(() => expect(mockDismissTo).toHaveBeenCalledWith("/arena"));
    expect(alert).toHaveBeenCalledTimes(2);
  });

  it("Android back confirms and cancels the same way, and never pops the route by itself", async () => {
    mockCancel.mockResolvedValue({ ok: true, data: {} });
    const alert = alertTaps(1);
    mount();
    expect(backHandlers.length).toBeGreaterThan(0);
    let handled: boolean | null | undefined;
    act(() => {
      handled = backHandlers[backHandlers.length - 1]();
    });
    expect(handled).toBe(true);
    expect(alert.mock.calls[0][0]).toBe("Cancel match?");
    await waitFor(() => expect(mockDismissTo).toHaveBeenCalledWith("/arena"));
    expect(mockCancel).toHaveBeenCalledWith(expect.anything(), "M1");
  });

  it("Android back while the alert is declined keeps the match and still consumes the press", () => {
    alertTaps(0);
    mount();
    let handled: boolean | null | undefined;
    act(() => {
      handled = backHandlers[backHandlers.length - 1]();
    });
    expect(handled).toBe(true);
    expect(mockCancel).not.toHaveBeenCalled();
  });

  it("releases Android back when the step goes", () => {
    const s = mount();
    s.unmount();
    expect(removeBack).toHaveBeenCalled();
  });
});
