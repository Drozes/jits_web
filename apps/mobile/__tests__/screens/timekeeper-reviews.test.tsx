/**
 * Admin > Timekeeper reviews (timekeeper mode A27, spec 9.2, board
 * P-TK-B15; TEST-PLAN M10): admin only (a non-admin, or one the server
 * refuses, is redirected and never reaches the admin RPCs); the list of
 * stalled results (matchup, TK-AD3, TK-AD4) with its empty state; Record
 * result opens M5's standalone `ResultForm` (full list, final clock, names
 * only) and records through `admin_resolve_timekeeper_review`; Void confirms
 * first (TK-AD5); each resolve toasts TK-AD6 and re-reads the list; and the
 * admin hub links here.
 */
import * as React from "react";
import { Alert, type AlertButton } from "react-native";
import { act, fireEvent, render, within } from "@testing-library/react-native";
import type { SubmissionType } from "@jits/shared/types/submission-type";

let mockIsAdmin = true;
jest.mock("@/lib/auth/hooks", () => ({
  useAuth: () => ({ isLoading: false }),
  useIsAdmin: () => mockIsAdmin,
}));
jest.mock("@/lib/supabase/client", () => ({ supabase: { tag: "client" } }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/lib/theme/use-theme", () => ({
  useThemedTokens: () => ({ textTertiary: "#8D929D", textOnAccent: "#0D0F14", textPrimary: "#fff" }),
  useResolvedColorScheme: () => "dark",
}));
jest.mock("lucide-react-native", () => {
  const RN = require("react-native");
  const R = require("react");
  return new Proxy({}, { get: (_t: Record<string, unknown>, p: string) => (p === "__esModule" ? true : () => R.createElement(RN.View, { testID: `icon-${p}` })) });
});
jest.mock("@/components/layout/app-header", () => ({
  AppHeader: ({ title }: { title: string }) => {
    const RN = require("react-native");
    return <RN.Text testID="app-header-title">{title}</RN.Text>;
  },
}));
jest.mock("@/components/layout/page-container", () => ({
  PageContainer: ({ children }: { children: React.ReactNode }) => {
    const RN = require("react-native");
    return <RN.View>{children}</RN.View>;
  },
}));
const mockRedirect = jest.fn();
const mockLinkHrefs: string[] = [];
jest.mock("expo-router", () => ({
  Redirect: (p: { href: string }) => {
    mockRedirect(p.href);
    return null;
  },
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => {
    mockLinkHrefs.push(href);
    return children;
  },
}));
const mockToast = { success: jest.fn(), error: jest.fn() };
jest.mock("@/components/ui/toast", () => ({
  get toast() {
    return mockToast;
  },
}));
const mockList = jest.fn();
const mockResolve = jest.fn();
jest.mock("@jits/shared/api/timekeeper", () => ({
  adminListTimekeeperReviews: (...a: unknown[]) => mockList(...a),
  adminResolveTimekeeperReview: (...a: unknown[]) => mockResolve(...a),
}));
const mockTypes = jest.fn();
jest.mock("@jits/shared/api/queries", () => ({
  getSubmissionTypes: (...a: unknown[]) => mockTypes(...a),
}));

import AdminTimekeeperReviewsScreen from "@/app/(app)/settings/admin/timekeeper-reviews";
import AdminScreen from "@/app/(app)/settings/admin";
import { formatClockEnded } from "@/components/admin/timekeeper-review-row";

const type = (code: string, display_name: string, sort_order: number): SubmissionType =>
  ({ code, display_name, category: "x", id: code, sort_order, status: "active" }) as SubmissionType;
const TYPES = [type("rear_naked_choke", "Rear Naked Choke", 1), type("armbar", "Armbar", 2), type("other", "Other Submission", 3)];

const ENDED_AT = "2026-10-21T10:00:00Z";
const REVIEW = {
  matchId: "m-1",
  flaggedAt: "2026-10-21T10:10:00Z",
  athletes: [
    { id: "a-1", displayName: "Marco Reyes" },
    { id: "a-2", displayName: "Dayo Okafor" },
  ],
  timekeeper: { id: "t-1", displayName: "Jo Cruz" },
  endedAt: ENDED_AT,
  finalElapsedS: 252,
  durationSeconds: 300,
};
const REVIEW_2 = {
  ...REVIEW,
  matchId: "m-2",
  athletes: [
    { id: "a-3", displayName: "Ana Silva" },
    { id: "a-4", displayName: "Kai Park" },
  ],
};

async function renderScreen() {
  const s = render(<AdminTimekeeperReviewsScreen />);
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  return s;
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

/** The buttons of the last alert. */
function lastAlertButtons(alert: jest.SpyInstance): AlertButton[] {
  return alert.mock.calls[alert.mock.calls.length - 1][2] as AlertButton[];
}

let alertSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  mockLinkHrefs.length = 0;
  mockIsAdmin = true;
  mockList.mockResolvedValue({ ok: true, data: [REVIEW, REVIEW_2] });
  mockTypes.mockResolvedValue(TYPES);
  mockResolve.mockResolvedValue({ ok: true, data: { action: "record", matchId: "m-1" } });
  alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
});

afterEach(() => alertSpy.mockRestore());

describe("AdminTimekeeperReviewsScreen: access", () => {
  it("redirects a non-admin and never calls the admin RPCs", async () => {
    mockIsAdmin = false;
    const s = await renderScreen();
    expect(mockRedirect).toHaveBeenCalledWith("/");
    expect(mockList).not.toHaveBeenCalled();
    expect(s.queryByTestId("tk-review-row-m-1")).toBeNull();
  });

  it("redirects when the server refuses the caller as not an admin", async () => {
    mockList.mockResolvedValue({ ok: false, error: { code: "NOT_ADMIN", message: "Admin access required" } });
    await renderScreen();
    expect(mockRedirect).toHaveBeenCalledWith("/");
  });
});

describe("AdminTimekeeperReviewsScreen: the list", () => {
  it("titles the screen TK-AD1 and shows each stalled match: matchup, TK-AD3 and the TK-AD4 actions", async () => {
    const s = await renderScreen();
    expect(s.getByTestId("app-header-title")).toHaveTextContent("Timekeeper reviews");
    const row = within(s.getByTestId("tk-review-row-m-1"));
    row.getByText("M. Reyes vs D. Okafor");
    row.getByText(`Timekeeper J. Cruz · clock ended ${formatClockEnded(ENDED_AT)} · 04:12 on the clock`);
    row.getByText("Record result");
    row.getByText("Void");
    within(s.getByTestId("tk-review-row-m-2")).getByText("A. Silva vs K. Park");
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("shows the empty state TK-AD2", async () => {
    mockList.mockResolvedValue({ ok: true, data: [] });
    const s = await renderScreen();
    expect(s.getByTestId("tk-reviews-empty")).toHaveTextContent("No matches waiting for review.");
  });

  it("an unknown timekeeper, end or clock reads as the shipped empty values", async () => {
    mockList.mockResolvedValue({ ok: true, data: [{ ...REVIEW, timekeeper: null, endedAt: null, finalElapsedS: null }] });
    const s = await renderScreen();
    within(s.getByTestId("tk-review-row-m-1")).getByText("Timekeeper -- · clock ended -- · --:-- on the clock");
  });

  it("a row without both athletes cannot be recorded (it can still be voided)", async () => {
    mockList.mockResolvedValue({ ok: true, data: [{ ...REVIEW, athletes: [REVIEW.athletes[0]] }] });
    const s = await renderScreen();
    expect(s.getByTestId("tk-review-record-m-1").props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    expect(s.getByTestId("tk-review-void-m-1").props.accessibilityState).toEqual(expect.objectContaining({ disabled: false }));
  });

  it("a failed read offers Retry, never a server message, and Retry reads again", async () => {
    mockList.mockResolvedValueOnce({ ok: false, error: { code: "UNKNOWN", message: "relation does not exist" } });
    const s = await renderScreen();
    expect(s.queryByText(/relation does not exist/)).toBeNull();
    expect(s.queryByTestId("tk-reviews-empty")).toBeNull();
    fireEvent.press(s.getByTestId("tk-reviews-retry"));
    await flush();
    expect(mockList).toHaveBeenCalledTimes(2);
    s.getByTestId("tk-review-row-m-1");
  });

  it("Refresh reads the list again", async () => {
    const s = await renderScreen();
    fireEvent.press(s.getByText("Refresh"));
    await flush();
    expect(mockList).toHaveBeenCalledTimes(2);
  });
});

describe("AdminTimekeeperReviewsScreen: Void", () => {
  it("confirms first (TK-AD5): Keep does nothing", async () => {
    const s = await renderScreen();
    fireEvent.press(s.getByTestId("tk-review-void-m-1"));
    expect(alertSpy).toHaveBeenCalledWith("Void this match?", "It becomes a no contest and won't count for either athlete.", expect.any(Array));
    const buttons = lastAlertButtons(alertSpy);
    expect(buttons.map((b) => [b.text, b.style])).toEqual([
      ["Keep", "cancel"],
      ["Void", "destructive"],
    ]);
    expect(buttons[0].onPress).toBeUndefined();
    expect(mockResolve).not.toHaveBeenCalled();
  });

  it("Void in the alert voids through the admin RPC, toasts TK-AD6 and re-reads the list", async () => {
    mockResolve.mockResolvedValue({ ok: true, data: { action: "void", matchId: "m-1" } });
    const s = await renderScreen();
    mockList.mockResolvedValue({ ok: true, data: [REVIEW_2] });
    fireEvent.press(s.getByTestId("tk-review-void-m-1"));
    await act(async () => {
      lastAlertButtons(alertSpy)[1].onPress?.();
    });
    await flush();
    expect(mockResolve).toHaveBeenCalledWith({ tag: "client" }, { matchId: "m-1", action: "void" });
    expect(mockToast.success).toHaveBeenCalledWith("Match voided");
    expect(mockList).toHaveBeenCalledTimes(2);
    expect(s.queryByTestId("tk-review-row-m-1")).toBeNull();
    s.getByTestId("tk-review-row-m-2");
  });

  it("a refused void toasts the deck's failure line, never the server's text", async () => {
    mockResolve.mockResolvedValue({ ok: false, error: { code: "NO_OPEN_REVIEW", message: "This match is no longer waiting for review." } });
    const s = await renderScreen();
    fireEvent.press(s.getByTestId("tk-review-void-m-1"));
    await act(async () => {
      lastAlertButtons(alertSpy)[1].onPress?.();
    });
    await flush();
    expect(mockToast.error).toHaveBeenCalledWith("Couldn't update the match");
    expect(s.queryByText(/no longer waiting/)).toBeNull();
    expect(mockList).toHaveBeenCalledTimes(2);
  });

  it("while one row resolves, the other rows' actions are locked", async () => {
    let finish: (v: unknown) => void = () => undefined;
    mockResolve.mockImplementationOnce(() => new Promise((r) => (finish = r)));
    const s = await renderScreen();
    fireEvent.press(s.getByTestId("tk-review-void-m-1"));
    await act(async () => {
      lastAlertButtons(alertSpy)[1].onPress?.();
    });
    expect(s.getByTestId("tk-review-void-m-2").props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    expect(s.getByTestId("tk-review-record-m-2").props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    expect(s.getByTestId("tk-review-void-m-1").props.accessibilityState).toEqual(expect.objectContaining({ busy: true }));
    await act(async () => {
      finish({ ok: true, data: { action: "void", matchId: "m-1" } });
    });
    await flush();
  });
});

describe("AdminTimekeeperReviewsScreen: Record result", () => {
  it("opens M5's result form for that match: the full list, the final clock, names only", async () => {
    const s = await renderScreen();
    fireEvent.press(s.getByTestId("tk-review-record-m-1"));
    const form = within(s.getByTestId("tk-review-record-form"));
    form.getByText("M. Reyes vs D. Okafor");
    form.getByText("Record result");
    form.getByText("ENDED AT 04:12");
    expect(form.getAllByTestId(/^result-winner-/).map((n) => n.props.testID)).toEqual(["result-winner-a-1", "result-winner-a-2"]);
    expect(form.queryByText("YOU")).toBeNull();
    expect(form.queryByText("OPPONENT")).toBeNull();
    fireEvent.press(form.getByTestId("result-winner-a-2"));
    form.getByTestId("result-submission-list");
    expect(s.queryByTestId("tk-review-row-m-2")).toBeNull();
  });

  it("records a submission through the admin RPC, toasts, closes the form and re-reads the list", async () => {
    const s = await renderScreen();
    mockList.mockResolvedValue({ ok: true, data: [REVIEW_2] });
    fireEvent.press(s.getByTestId("tk-review-record-m-1"));
    fireEvent.press(s.getByTestId("result-winner-a-2"));
    fireEvent.press(s.getByTestId("result-submission-armbar"));
    fireEvent.changeText(s.getByTestId("result-finish-time"), "3:05");
    await act(async () => {
      fireEvent.press(s.getByTestId("result-record"));
    });
    await flush();
    expect(mockResolve).toHaveBeenCalledWith(
      { tag: "client" },
      { matchId: "m-1", action: "record", result: "submission", winnerId: "a-2", submissionTypeCode: "armbar", finishTimeSeconds: 185 },
    );
    expect(mockToast.success).toHaveBeenCalledWith("Result recorded");
    expect(mockList).toHaveBeenCalledTimes(2);
    expect(s.queryByTestId("tk-review-record-form")).toBeNull();
    expect(s.queryByTestId("tk-review-row-m-1")).toBeNull();
    s.getByTestId("tk-review-row-m-2");
  });

  it("records a draw with no winner, finish or time", async () => {
    const s = await renderScreen();
    fireEvent.press(s.getByTestId("tk-review-record-m-1"));
    fireEvent.press(s.getByTestId("result-outcome-draw"));
    await act(async () => {
      fireEvent.press(s.getByTestId("result-record"));
    });
    await flush();
    expect(mockResolve).toHaveBeenCalledWith(
      { tag: "client" },
      { matchId: "m-1", action: "record", result: "draw", winnerId: null, submissionTypeCode: null, finishTimeSeconds: null },
    );
  });

  it("a refused record keeps the form for a fix, with the deck's failure toast", async () => {
    mockResolve.mockResolvedValue({ ok: false, error: { code: "INVALID_RESULT", message: "Invalid submission type." } });
    const s = await renderScreen();
    fireEvent.press(s.getByTestId("tk-review-record-m-1"));
    fireEvent.press(s.getByTestId("result-outcome-draw"));
    await act(async () => {
      fireEvent.press(s.getByTestId("result-record"));
    });
    await flush();
    expect(mockToast.error).toHaveBeenCalledWith("Couldn't update the match");
    expect(s.queryByText("Invalid submission type.")).toBeNull();
    s.getByTestId("tk-review-record-form");
    expect(mockList).toHaveBeenCalledTimes(1);
  });

  it("a record refused because the review is gone closes the form and re-reads", async () => {
    mockResolve.mockResolvedValue({ ok: false, error: { code: "MATCH_NOT_PENDING", message: "x" } });
    const s = await renderScreen();
    fireEvent.press(s.getByTestId("tk-review-record-m-1"));
    fireEvent.press(s.getByTestId("result-outcome-draw"));
    await act(async () => {
      fireEvent.press(s.getByTestId("result-record"));
    });
    await flush();
    expect(s.queryByTestId("tk-review-record-form")).toBeNull();
    expect(mockList).toHaveBeenCalledTimes(2);
  });

  it("Back returns to the list without recording", async () => {
    const s = await renderScreen();
    fireEvent.press(s.getByTestId("tk-review-record-m-1"));
    fireEvent.press(s.getByTestId("tk-review-record-back"));
    expect(s.queryByTestId("tk-review-record-form")).toBeNull();
    s.getByTestId("tk-review-row-m-1");
    expect(mockResolve).not.toHaveBeenCalled();
  });
});

describe("Admin hub", () => {
  it("links to Timekeeper reviews (TK-AD1)", () => {
    const s = render(<AdminScreen />);
    s.getByText("Timekeeper reviews");
    expect(mockLinkHrefs).toContain("/settings/admin/timekeeper-reviews");
  });
});
