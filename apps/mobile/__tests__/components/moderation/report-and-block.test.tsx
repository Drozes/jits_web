/**
 * Report and block sheets (jits-rog5.11, App Review 1.2): the report form's
 * reasons, submit, thanks toast and HINT copy; the athlete More sheet's
 * block confirm; the profile's blocked states; never on your own profile.
 */
import * as React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";

jest.mock("@/lib/supabase/client", () => ({ supabase: { tag: "client" } }));
jest.mock("lucide-react-native", () => {
  const R = require("react");
  const RN = require("react-native");
  const stub = () => R.createElement(RN.View);
  return new Proxy({}, { get: (_t, p) => (p === "__esModule" ? true : stub) });
});
jest.mock("@gorhom/bottom-sheet", () => {
  const RN = require("react-native");
  return { BottomSheetTextInput: RN.TextInput };
});
// The gorhom modal needs its provider: an open sheet is just its children here.
jest.mock("@/components/ui/form-sheet", () => ({
  FormSheet: ({ open, children }: { open: boolean; children: React.ReactNode }) => (open ? children : null),
}));
const mockToast = { success: jest.fn(), error: jest.fn(), info: jest.fn() };
jest.mock("@/components/ui/toast", () => ({
  get toast() {
    return mockToast;
  },
}));
jest.mock("@/lib/invites/use-friend-ids", () => ({ notifyFriendsChanged: jest.fn() }));

const mockApi = {
  reportContent: jest.fn(),
  blockAthlete: jest.fn(),
  unblockAthlete: jest.fn(),
  getMyBlockIds: jest.fn(),
  getMyBlockedAthletes: jest.fn(),
};
jest.mock("@jits/shared/api/moderation", () => ({
  ...jest.requireActual("@jits/shared/api/moderation"),
  reportContent: (...a: unknown[]) => mockApi.reportContent(...a),
  blockAthlete: (...a: unknown[]) => mockApi.blockAthlete(...a),
  unblockAthlete: (...a: unknown[]) => mockApi.unblockAthlete(...a),
  getMyBlockIds: (...a: unknown[]) => mockApi.getMyBlockIds(...a),
  getMyBlockedAthletes: (...a: unknown[]) => mockApi.getMyBlockedAthletes(...a),
}));

import { ReportForm } from "@/components/moderation/report-form";
import { AthleteModerationSheet, type AthleteSheetMode } from "@/components/moderation/athlete-moderation-sheet";
import { BlockedAthleteState } from "@/components/moderation/blocked-athlete-state";
import { __resetBlocksForTests, isBlocked } from "@/lib/moderation/block-store";

beforeEach(() => {
  jest.clearAllMocks();
  __resetBlocksForTests({ athleteId: "me", loaded: true });
  mockApi.reportContent.mockResolvedValue({ ok: true, data: "r-1" });
  mockApi.blockAthlete.mockResolvedValue({ ok: true, data: undefined });
  mockApi.unblockAthlete.mockResolvedValue({ ok: true, data: undefined });
  mockApi.getMyBlockIds.mockResolvedValue({ ok: true, data: [] });
  mockApi.getMyBlockedAthletes.mockResolvedValue({ ok: true, data: [] });
});

describe("ReportForm", () => {
  function renderForm(onDone = jest.fn()) {
    return { onDone, ...render(<ReportForm targetType="match_video" targetId="v-1" onDone={onDone} onCancel={jest.fn()} />) };
  }

  it("lists the five reasons and Submit waits for one", () => {
    const s = renderForm();
    for (const label of ["Inappropriate content", "Harassment or bullying", "Impersonation", "Spam", "Something else"]) {
      expect(s.getByText(label)).toBeTruthy();
    }
    expect(s.getByText("Report video")).toBeTruthy();
    expect(s.getByTestId("report-submit").props.accessibilityState.disabled).toBe(true);
  });

  it("sends the reason and details, toasts the 24 hour promise and closes", async () => {
    const s = renderForm();
    fireEvent.press(s.getByTestId("report-reason-harassment"));
    fireEvent.changeText(s.getByTestId("report-details"), "  Said things after the match  ");
    await act(async () => {
      fireEvent.press(s.getByTestId("report-submit"));
    });
    expect(mockApi.reportContent).toHaveBeenCalledWith(
      { tag: "client" },
      { targetType: "match_video", targetId: "v-1", reason: "harassment", details: "  Said things after the match  " },
    );
    expect(mockToast.success).toHaveBeenCalledWith("Thanks. We review every report within 24 hours.");
    expect(s.onDone).toHaveBeenCalledTimes(1);
  });

  it("caps details at 1000 characters", () => {
    const s = renderForm();
    expect(s.getByTestId("report-details").props.maxLength).toBe(1000);
    expect(s.getByTestId("report-details-counter").props.children).toBe("0/1000");
  });

  it.each([
    ["report_rate_limited", "You've sent a lot of reports. Try again later."],
    ["cannot_report_self", "You can't report your own profile or content."],
    ["invalid_target", "This can't be reported anymore."],
    ["not_authenticated", "Sign in again, then try again."],
    ["unknown", "Couldn't send your report. Check your connection and try again."],
  ])("a refused report (%s) stays open with friendly copy", async (hint, copy) => {
    mockApi.reportContent.mockResolvedValue({ ok: false, error: { hint, message: "raw" } });
    const s = renderForm();
    fireEvent.press(s.getByTestId("report-reason-spam"));
    await act(async () => {
      fireEvent.press(s.getByTestId("report-submit"));
    });
    expect(s.getByTestId("report-error").props.children).toBe(copy);
    expect(s.onDone).not.toHaveBeenCalled();
    expect(mockToast.success).not.toHaveBeenCalled();
  });
});

describe("AthleteModerationSheet", () => {
  function Host({ blockedByMe = false, initial = "menu" as AthleteSheetMode | null }) {
    const [mode, setMode] = React.useState<AthleteSheetMode | null>(initial);
    return <AthleteModerationSheet mode={mode} onModeChange={setMode} athlete={{ id: "ath-2", name: "Alex Park" }} blockedByMe={blockedByMe} />;
  }

  it("offers Report athlete and Block athlete", () => {
    const s = render(<Host />);
    expect(s.getByText("Report athlete")).toBeTruthy();
    expect(s.getByText("Block athlete")).toBeTruthy();
  });

  it("Block asks first, with the consequences, then blocks and toasts", async () => {
    mockApi.getMyBlockIds.mockResolvedValue({ ok: true, data: ["ath-2"] });
    mockApi.getMyBlockedAthletes.mockResolvedValue({ ok: true, data: [{ athlete_id: "ath-2", display_name: "Alex Park", blocked_at: "2026-10-14T10:00:00Z" }] });
    const s = render(<Host />);
    fireEvent.press(s.getByTestId("athlete-action-block"));
    expect(s.getByText("Block Alex Park?")).toBeTruthy();
    expect(
      s.getByText(
        "They won't be able to challenge you, and you won't see each other in the Arena or your lists. You can unblock in Settings.",
      ),
    ).toBeTruthy();
    expect(mockApi.blockAthlete).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.press(s.getByTestId("block-confirm-button"));
    });
    expect(mockApi.blockAthlete).toHaveBeenCalledWith({ tag: "client" }, "ath-2");
    expect(isBlocked("ath-2")).toBe(true);
    expect(mockToast.success).toHaveBeenCalledWith("You blocked Alex Park.");
    expect(s.queryByTestId("block-confirm")).toBeNull();
  });

  it("Cancel on the confirm blocks nobody", () => {
    const s = render(<Host />);
    fireEvent.press(s.getByTestId("athlete-action-block"));
    fireEvent.press(s.getByTestId("block-cancel"));
    expect(mockApi.blockAthlete).not.toHaveBeenCalled();
  });

  it("a refused block keeps the sheet and says why", async () => {
    mockApi.blockAthlete.mockResolvedValue({ ok: false, error: { hint: "athlete_not_found", message: "" } });
    const s = render(<Host />);
    fireEvent.press(s.getByTestId("athlete-action-block"));
    await act(async () => {
      fireEvent.press(s.getByTestId("block-confirm-button"));
    });
    expect(mockToast.error).toHaveBeenCalledWith("This athlete isn't available anymore.");
    expect(s.getByTestId("block-confirm")).toBeTruthy();
  });

  it("Report athlete opens the report form for the athlete", () => {
    const s = render(<Host />);
    fireEvent.press(s.getByTestId("athlete-action-report"));
    expect(s.getByTestId("report-form")).toBeTruthy();
  });

  it("already blocked by me: the menu offers Unblock", async () => {
    const s = render(<Host blockedByMe />);
    expect(s.queryByText("Block athlete")).toBeNull();
    await act(async () => {
      fireEvent.press(s.getByTestId("athlete-action-unblock"));
    });
    expect(mockApi.unblockAthlete).toHaveBeenCalledWith({ tag: "client" }, "ath-2");
    expect(mockToast.success).toHaveBeenCalledWith("You unblocked Alex Park.");
  });

  it("is not mounted until first opened", () => {
    const s = render(<Host initial={null} />);
    expect(s.queryByTestId("athlete-actions-menu")).toBeNull();
  });
});

describe("BlockedAthleteState", () => {
  it("blocked by me: says so and offers Unblock", async () => {
    const s = render(<BlockedAthleteState athlete={{ id: "ath-2", name: "Alex Park" }} blockedByMe />);
    expect(s.getByText(/You blocked Alex Park\./)).toBeTruthy();
    await act(async () => {
      fireEvent.press(s.getByTestId("athlete-unblock"));
    });
    expect(mockApi.unblockAthlete).toHaveBeenCalledWith({ tag: "client" }, "ath-2");
  });

  it("blocked by them: not available, nothing to act on", () => {
    const s = render(<BlockedAthleteState athlete={{ id: "ath-2", name: "Alex Park" }} blockedByMe={false} />);
    expect(s.getByText("You can't see this athlete's profile.")).toBeTruthy();
    expect(s.queryByTestId("athlete-unblock")).toBeNull();
  });
});
