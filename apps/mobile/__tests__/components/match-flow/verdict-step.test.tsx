/**
 * Verdict (the redesigned summary step): win celebration vs calm loss, the
 * harness contract (summary-verdict / summary-elo-delta with the ▲/▼ prefix /
 * summary-exit), the rank strip from get_match_rank_change (B6) and its
 * graceful absence, Rematch sending the challenge directly, Share with a
 * match link, the opening still with its fallback, and the upload card.
 */
import * as React from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

jest.mock("lucide-react-native", () => {
  const RN = require("react-native");
  const R = require("react");
  const stub = () => R.createElement(RN.View, { testID: "icon" });
  return new Proxy({}, { get: (_t: Record<string, unknown>, prop: string) => (prop === "__esModule" ? true : stub) });
});
jest.mock("@/lib/theme/use-theme", () => ({
  useThemedTokens: () => ({ textPrimary: "#E8EDF2", textSecondary: "#9AA3AD", stateNegative: "#EC6A74" }),
  useResolvedColorScheme: () => "dark",
}));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("expo-image", () => {
  const R = require("react");
  const RN = require("react-native");
  return { Image: (p: { source?: { uri?: string } }) => R.createElement(RN.View, { testID: "still-image", uri: p.source?.uri }) };
});
jest.mock("@/lib/supabase/client", () => ({ supabase: { tag: "client" } }));

const mockDismissTo = jest.fn();
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ dismissTo: mockDismissTo, push: mockPush, back: jest.fn() }),
}));

type SyncParams = { onMatchDisputed?: (id: string) => void; enabled?: boolean };
let mockSyncParams: SyncParams = {};
const mockReconcileNow = jest.fn();
jest.mock("@/lib/match-flow/match-sync-context", () => ({
  useMatchSyncContext: () => ({ reconcileNow: mockReconcileNow }),
  useStepMatchSync: (p: SyncParams) => {
    mockSyncParams = p;
    return {};
  },
}));
jest.mock("@/components/ui/toast", () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));

const mockDetailView = jest.fn();
jest.mock("@jits/shared/api/queries", () => ({
  getMatchDetailView: (...a: unknown[]) => mockDetailView(...a),
}));
const mockRankChange = jest.fn();
jest.mock("@jits/shared/api/match-rank-change", () => ({
  getMatchRankChange: (...a: unknown[]) => mockRankChange(...a),
}));

import { Share } from "react-native";
import { VerdictStep, rematchHref } from "@/components/match-flow/verdict/verdict-step";
import { ARENA_EXIT_LABEL, ARENA_HREF } from "@/lib/arena/constants";

type Props = React.ComponentProps<typeof VerdictStep>;
const HIDDEN = { kind: "hidden", message: null, truncation: null, progress: null } as const;

function renderVerdict(overrides: Partial<Props> = {}) {
  const props: Props = {
    matchId: "M1",
    exitHref: ARENA_HREF,
    exitLabel: ARENA_EXIT_LABEL,
    matchType: "ranked",
    matchStatus: "completed",
    outcome: "win",
    me: { athlete_id: "me", display_name: "Kai Reyes", elo_before: 1512, elo_after: 1526, elo_delta: 14, weight_division_gap: 0 },
    opponent: { athlete_id: "opp", display_name: "Mina Park" },
    submissionName: "Rear-naked choke",
    finishTimeSeconds: 377,
    upload: HIDDEN,
    uploadedVideoId: null,
    ...overrides,
  };
  return render(<VerdictStep {...props} />);
}

const color = (el: { props: { style?: unknown } }) => (StyleSheet.flatten(el.props.style as never) as { color?: string } | undefined)?.color;

beforeEach(() => {
  jest.clearAllMocks();
  mockSyncParams = {};
  mockDetailView.mockResolvedValue({ ok: true, data: { videos: [] } });
  mockRankChange.mockResolvedValue({ ok: false, error: { code: "UNKNOWN", message: "missing" } });
});

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("verdict copy and the harness contract", () => {
  it("a win: YOU WON, the finish, and a green ▲ delta", async () => {
    const s = renderVerdict();
    await flush();
    expect(s.getByTestId("summary-verdict")).toHaveTextContent("YOU WON");
    expect(s.getByText("by Rear-naked choke · 06:17")).toBeTruthy();
    const delta = s.getByTestId("summary-elo-delta");
    expect(delta).toHaveTextContent("▲ +14");
    expect(color(delta)).toBe("#22C55E");
    expect(s.getByTestId("verdict-confetti", { includeHiddenElements: true })).toBeTruthy();
  });

  it("a loss: YOU LOST, a red ▼ delta, no confetti", async () => {
    const s = renderVerdict({ outcome: "loss", me: { athlete_id: "me", display_name: "Kai Reyes", elo_before: 1498, elo_after: 1489, elo_delta: -9 } });
    await flush();
    expect(s.getByTestId("summary-verdict")).toHaveTextContent("YOU LOST");
    expect(s.getByTestId("summary-elo-delta")).toHaveTextContent("▼ −9");
    expect(color(s.getByTestId("summary-elo-delta"))).toBe("#F0556B");
    expect(s.queryByTestId("verdict-confetti", { includeHiddenElements: true })).toBeNull();
  });

  it("a draw: amber, never Signal Red", async () => {
    const s = renderVerdict({ outcome: "draw", me: { athlete_id: "me", display_name: "Kai Reyes", elo_before: 1500, elo_after: 1498, elo_delta: -2 } });
    await flush();
    expect(s.getByTestId("summary-verdict")).toHaveTextContent("DRAW");
    expect(color(s.getByTestId("summary-verdict"))).toBe("#F59E0B");
    expect(color(s.getByTestId("summary-elo-delta"))).toBe("#F59E0B");
  });

  it("a disputed match: DISPUTED with the review note, no rematch or share", async () => {
    const s = renderVerdict({ matchStatus: "disputed" });
    await flush();
    expect(s.getByTestId("summary-verdict")).toHaveTextContent("DISPUTED");
    expect(s.getByTestId("summary-disputed-note")).toBeTruthy();
    expect(s.queryByTestId("summary-rematch")).toBeNull();
    expect(s.queryByTestId("summary-share")).toBeNull();
  });

  it("casual: no rating block", async () => {
    const s = renderVerdict({ matchType: "casual" });
    await flush();
    expect(s.queryByTestId("summary-elo-delta")).toBeNull();
  });

  it("keeps the weight-gap note the harness looks for", async () => {
    const s = renderVerdict({ me: { athlete_id: "me", display_name: "Kai Reyes", elo_before: 1512, elo_after: 1526, elo_delta: 14, weight_division_gap: 1 } });
    await flush();
    expect(s.getByText(/1 weight class apart/)).toBeTruthy();
  });
});

describe("actions", () => {
  it("win: Watch film is the one red CTA, Back to Arena exits", async () => {
    const s = renderVerdict();
    await flush();
    fireEvent.press(s.getByTestId("summary-watch-film"));
    expect(mockPush).toHaveBeenCalledWith("/(app)/match-detail/M1");
    fireEvent.press(s.getByTestId("summary-exit"));
    expect(mockDismissTo).toHaveBeenCalledWith(ARENA_HREF);
    expect(s.getByText(ARENA_EXIT_LABEL)).toBeTruthy();
  });

  it("loss: Rematch is the red CTA and hands the send to the Arena (send=1)", async () => {
    const s = renderVerdict({ outcome: "loss", me: { athlete_id: "me", display_name: "Kai Reyes", elo_delta: -9, elo_before: 1498, elo_after: 1489 } });
    await flush();
    expect(s.getByText("Run it back?")).toBeTruthy();
    fireEvent.press(s.getByTestId("summary-rematch"));
    // Not sent from here: the opponent is likely still on their verdict,
    // where their app declines every challenge as busy.
    expect(mockDismissTo).toHaveBeenCalledWith("/arena?rematch=opp&send=1");
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("encodes the rematch href", () => {
    expect(rematchHref("a b&c")).toBe(`${ARENA_HREF}?rematch=a%20b%26c`);
    expect(rematchHref("x", { send: true })).toBe(`${ARENA_HREF}?rematch=x&send=1`);
  });

  it("shares the live web match page once, with the stamped rating", async () => {
    const spy = jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction" } as never);
    const s = renderVerdict();
    await flush();
    await act(async () => {
      fireEvent.press(s.getByTestId("summary-share"));
    });
    const arg = spy.mock.calls[0][0] as { message: string; url?: string };
    expect(arg.url).toBeUndefined();
    expect(arg.message).toBe("I just won a match on ELO RATED! New rating: 1526 (+14)\nhttps://jitsweb.vercel.app/matches/M1");
    expect(arg.message.match(/https:/g)).toHaveLength(1);
    spy.mockRestore();
  });

  it("leaves the rating out of the share until the stamped rating is in", async () => {
    const spy = jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction" } as never);
    const s = renderVerdict({ me: { athlete_id: "me", display_name: "Kai Reyes", current_elo: 1512, elo_after: null, elo_delta: null } });
    await flush();
    await act(async () => {
      fireEvent.press(s.getByTestId("summary-share"));
    });
    expect((spy.mock.calls[0][0] as { message: string }).message).toBe("I just won a match on ELO RATED!\nhttps://jitsweb.vercel.app/matches/M1");
    spy.mockRestore();
  });

  it("Watch film waits while this phone's clip is still uploading", async () => {
    const s = renderVerdict({
      outcome: "loss",
      me: { athlete_id: "me", display_name: "Kai Reyes", elo_delta: -9, elo_before: 1498, elo_after: 1489 },
      upload: { kind: "uploading", message: null, truncation: null, progress: 0.64 },
    });
    await flush();
    expect(s.getByTestId("summary-watch-film").props.accessibilityState.disabled).toBe(true);
    expect(s.getByText("PROCESSING")).toBeTruthy();
    expect(s.getByText(/UPLOADING 64% · STILL ARRIVES AFTER UPLOAD/)).toBeTruthy();
    // The upload card replaced the banner over every post-live step.
    expect(s.getByTestId("upload-status-banner")).toBeTruthy();
  });

  it("no film at all: the secondary action is Match details and the hero says so", async () => {
    const s = renderVerdict();
    await flush();
    expect(s.getByText("Match details")).toBeTruthy();
    expect(s.getByText("NO FILM FOR THIS MATCH")).toBeTruthy();
  });
});

describe("rank strip (B6)", () => {
  it("shows the climb and who was passed", async () => {
    mockRankChange.mockResolvedValue({
      ok: true,
      data: { rank_before: 23, rank_after: 19, direction: "up", passed: [{ athlete_id: "x", display_name: "Joao Silva" }], passed_total: 1 },
    });
    const s = renderVerdict();
    await waitFor(() => expect(s.getByTestId("verdict-rank-strip")).toBeTruthy());
    expect(s.getByText("#23 → #19 · PASSED J. SILVA")).toBeTruthy();
    expect(mockRankChange).toHaveBeenCalledWith(expect.anything(), "M1");
  });

  it("is simply absent when the RPC is missing (older backend) or on a loss", async () => {
    const s = renderVerdict();
    await flush();
    expect(s.queryByTestId("verdict-rank-strip")).toBeNull();
    renderVerdict({ outcome: "loss" });
    expect(mockRankChange).toHaveBeenCalledTimes(1);
  });
});

describe("opening still", () => {
  it("uses the match's signed poster when one exists", async () => {
    mockDetailView.mockResolvedValue({
      ok: true,
      data: { videos: [{ id: "v1", poster_url: "https://signed/poster.jpg" }] },
    });
    const s = renderVerdict();
    await waitFor(() => expect(s.getByTestId("verdict-still")).toBeTruthy());
    expect(s.getByTestId("still-image").props.uri).toBe("https://signed/poster.jpg");
    expect(s.getByText("Watch film")).toBeTruthy();
  });

  it("falls back to the athletes with STILL ARRIVES AFTER UPLOAD while a video has no poster", async () => {
    mockDetailView.mockResolvedValue({ ok: true, data: { videos: [{ id: "v1", poster_url: null }] } });
    const s = renderVerdict();
    await waitFor(() => expect(s.getByText("STILL ARRIVES AFTER UPLOAD")).toBeTruthy());
    expect(s.getByTestId("verdict-still-fallback")).toBeTruthy();
  });
});

describe("the recorder learns of a dispute (S1)", () => {
  it("a match_disputed from the opponent turns the win into the calm DISPUTED verdict", async () => {
    const s = renderVerdict({ confirmedAthleteIds: ["me"] });
    await flush();
    expect(s.getByTestId("summary-verdict")).toHaveTextContent("YOU WON");
    act(() => mockSyncParams.onMatchDisputed?.("opp"));
    expect(s.getByTestId("summary-verdict")).toHaveTextContent("DISPUTED");
    s.getByTestId("summary-disputed-note");
    expect(s.queryByTestId("verdict-confetti", { includeHiddenElements: true })).toBeNull();
    expect(s.queryByTestId("summary-rematch")).toBeNull();
    expect(mockReconcileNow).toHaveBeenCalled();
  });

  it("ignores its own match_disputed echo", async () => {
    const s = renderVerdict();
    await flush();
    act(() => mockSyncParams.onMatchDisputed?.("me"));
    expect(s.getByTestId("summary-verdict")).toHaveTextContent("YOU WON");
  });

  it("re-reads the match every 15 s while the opponent has not confirmed, bounded", () => {
    jest.useFakeTimers();
    renderVerdict({ confirmedAthleteIds: ["me"] });
    act(() => {
      jest.advanceTimersByTime(15_000 * 3);
    });
    expect(mockReconcileNow).toHaveBeenCalledTimes(3);
    act(() => {
      jest.advanceTimersByTime(15_000 * 60);
    });
    expect(mockReconcileNow).toHaveBeenCalledTimes(40);
    jest.useRealTimers();
  });

  it("does not poll once both have confirmed, nor on a match already disputed", () => {
    jest.useFakeTimers();
    renderVerdict({ confirmedAthleteIds: ["me", "opp"] });
    renderVerdict({ matchStatus: "disputed" });
    act(() => {
      jest.advanceTimersByTime(60_000);
    });
    expect(mockReconcileNow).not.toHaveBeenCalled();
    jest.useRealTimers();
  });
});
