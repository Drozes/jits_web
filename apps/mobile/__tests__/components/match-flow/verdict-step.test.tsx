/**
 * Verdict (the redesigned summary step): win celebration vs calm loss, the
 * harness contract (summary-verdict / summary-elo-delta with the ▲/▼ prefix /
 * summary-exit), the rank strip from get_match_rank_change (B6) and its
 * graceful absence, the P-Verdict actions (no Rematch, jits-02vo.8), Share with a
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
let mockScheme: "dark" | "light" = "dark";
jest.mock("@/lib/theme/use-theme", () => ({
  useThemedTokens: () => ({ textPrimary: "#E8EDF2", textSecondary: "#9AA3AD", stateNegative: "#EC6A74" }),
  useResolvedColorScheme: () => mockScheme,
}));
const mockStatusBar = jest.fn();
jest.mock("expo-status-bar", () => ({
  StatusBar: (p: { style: string }) => {
    mockStatusBar(p.style);
    return null;
  },
}));
jest.mock("react-native-safe-area-context", () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock("expo-image", () => {
  const R = require("react");
  const RN = require("react-native");
  return {
    Image: (p: { source?: { uri?: string; cacheKey?: string } }) =>
      R.createElement(RN.View, { testID: "still-image", uri: p.source?.uri, cacheKey: p.source?.cacheKey }),
  };
});
jest.mock("@/lib/supabase/client", () => ({ supabase: { tag: "client" } }));
// The Film status read is unavailable here: the wave 2 film rows stand in (jits-n2im.25).
jest.mock("@/lib/video/use-film-status", () => require("../../support/film-status-mock").unavailableFilmStatusModule());
// Match-level match_videos realtime (jits-n2im.12): its own tests live in
// packages/shared; here it is inert.
const mockMatchVideosRealtime = jest.fn();
jest.mock("@jits/shared/hooks/use-match-videos-realtime", () => ({
  useMatchVideosRealtime: (...a: unknown[]) => mockMatchVideosRealtime(...a) ?? { subscribed: true },
}));

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

// Highlight flags for the post-match reel note (spec 015 section 16.6.4).
const mockGetFlags = jest.fn();
jest.mock("@jits/shared/api/highlight-share", () => ({
  getHighlightFlags: (...a: unknown[]) => mockGetFlags(...a),
}));

import { Share } from "react-native";
import { VerdictStep } from "@/components/match-flow/verdict/verdict-step";
import { WizardScrollContext, useWizardScrollSource } from "@/components/match-flow/wizard-scroll";
import { ARENA_EXIT_LABEL, ARENA_HREF } from "@/lib/arena/constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  PLAYED_STORAGE_KEY,
  __reloadPlayedForTests,
  __resetFreshForTests,
  __resetPlayedMomentsForTests,
} from "@/components/ui/elo-system/play-once";

type Props = React.ComponentProps<typeof VerdictStep>;
const HIDDEN = { kind: "hidden", message: null, truncation: null, progress: null } as const;

function renderVerdict(overrides: Partial<Props> = {}) {
  const props: Props = {
    matchId: "M1",
    exitHref: ARENA_HREF,
    exitLabel: ARENA_EXIT_LABEL,
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
  __resetPlayedMomentsForTests();
  __resetFreshForTests();
  mockSyncParams = {};
  mockDetailView.mockResolvedValue({ ok: true, data: { videos: [] } });
  mockRankChange.mockResolvedValue({ ok: false, error: { code: "UNKNOWN", message: "missing" } });
  mockGetFlags.mockResolvedValue({ ok: true, data: { clipsEnabled: false, shareEnabled: false } });
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

  it("the rating card reads only the final value and delta, with the tap marks on a submission (Adding Flare)", async () => {
    const s = renderVerdict();
    await flush();
    expect(s.getByTestId("verdict-rating-card").props.accessibilityLabel).toBe("Rating 1526, up 14");
    expect(s.getByTestId("verdict-tap-marks", { includeHiddenElements: true })).toBeTruthy();
  });

  it("the whole celebration plays once per result: a remount is static (Adding Flare)", async () => {
    const first = renderVerdict();
    await flush();
    expect(first.getByTestId("verdict-confetti", { includeHiddenElements: true })).toBeTruthy();
    first.unmount();
    const again = renderVerdict();
    await flush();
    expect(again.queryByTestId("verdict-confetti", { includeHiddenElements: true })).toBeNull();
    expect(again.getByTestId("verdict-rating-value", { includeHiddenElements: true })).toHaveTextContent("1526");
  });

  it("a result played on an earlier launch (stored key) is static (Adding Flare)", async () => {
    await AsyncStorage.setItem(PLAYED_STORAGE_KEY, JSON.stringify({ "verdict:M1": 1 }));
    await __reloadPlayedForTests();
    try {
      const s = renderVerdict();
      await flush();
      expect(s.queryByTestId("verdict-confetti", { includeHiddenElements: true })).toBeNull();
      expect(s.getByTestId("verdict-rating-value", { includeHiddenElements: true })).toHaveTextContent("1526");
    } finally {
      await AsyncStorage.removeItem(PLAYED_STORAGE_KEY);
    }
  });

  it("an old result (completed over 5 minutes ago) is static (Adding Flare)", async () => {
    const s = renderVerdict({ completedAt: new Date(Date.now() - 60 * 60_000).toISOString() });
    await flush();
    expect(s.queryByTestId("verdict-confetti", { includeHiddenElements: true })).toBeNull();
    expect(s.getByTestId("verdict-rating-value", { includeHiddenElements: true })).toHaveTextContent("1526");
  });

  it("prefers the result type over the catalogue name for the tap (Adding Flare)", async () => {
    const draw = renderVerdict({ outcome: "draw", resultType: "draw", submissionName: "Armbar" });
    await flush();
    expect(draw.queryByTestId("verdict-tap-marks", { includeHiddenElements: true })).toBeNull();
    draw.unmount();
    const sub = renderVerdict({ resultType: "submission", submissionName: null });
    await flush();
    expect(sub.getByTestId("verdict-tap-marks", { includeHiddenElements: true })).toBeTruthy();
  });

  it("a loss: YOU LOST, a red ▼ delta, no confetti", async () => {
    const s = renderVerdict({ outcome: "loss", me: { athlete_id: "me", display_name: "Kai Reyes", elo_before: 1498, elo_after: 1489, elo_delta: -9 } });
    await flush();
    expect(s.getByTestId("summary-verdict")).toHaveTextContent("YOU LOST");
    expect(s.getByTestId("summary-elo-delta")).toHaveTextContent("▼ −9");
    // The dark theme's red text token.
    expect(color(s.getByTestId("summary-elo-delta"))).toBe("#EC6A74");
    expect(s.queryByTestId("verdict-confetti", { includeHiddenElements: true })).toBeNull();
  });

  it("follows the app theme: the light scheme uses the light text tokens (AA on the light plates)", async () => {
    mockScheme = "light";
    try {
      const loss = renderVerdict({ outcome: "loss", me: { athlete_id: "me", display_name: "Kai Reyes", elo_before: 1498, elo_after: 1489, elo_delta: -9 } });
      await flush();
      expect(color(loss.getByTestId("summary-verdict"))).toBe("#0D0F14");
      expect(color(loss.getByTestId("summary-elo-delta"))).toBe("#AC2B34");
      loss.unmount();
      const win = renderVerdict({ outcome: "win", me: { athlete_id: "me", display_name: "Kai Reyes", elo_before: 1498, elo_after: 1512, elo_delta: 14 } });
      await flush();
      expect(color(win.getByTestId("summary-elo-delta"))).toBe("#116A33");
      win.unmount();
      const draw = renderVerdict({ outcome: "draw", me: { athlete_id: "me", display_name: "Kai Reyes", elo_before: 1500, elo_after: 1498, elo_delta: -2 } });
      await flush();
      expect(color(draw.getByTestId("summary-verdict"))).toBe("#92400E");
    } finally {
      mockScheme = "dark";
    }
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
    expect(s.queryByText(/rematch/i)).toBeNull();
    expect(s.queryByTestId("summary-share")).toBeNull();
  });

  it("a legacy row with no recorded rating shows no rating block and never casual", async () => {
    const s = renderVerdict({ me: { athlete_id: "me", display_name: "Kai Reyes", elo_before: null, elo_after: null, elo_delta: null, weight_division_gap: 0 } });
    await flush();
    expect(s.queryByTestId("summary-elo-delta")).toBeNull();
    expect(s.queryByText(/casual/i)).toBeNull();
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

  it("win: exactly Watch film, Back to Arena, Share match, in that order, and no Rematch (P-Verdict)", async () => {
    const s = renderVerdict();
    await flush();
    expect(s.queryByTestId("summary-rematch")).toBeNull();
    expect(s.queryByText(/rematch/i)).toBeNull();
    const order = s.getAllByTestId(/^summary-(watch-film|exit|share)$/).map((n) => String(n.props.testID));
    expect(order).toEqual(["summary-watch-film", "summary-exit", "summary-share"]);
    // Share is its own full-width tertiary row, not half of a split row.
    expect(StyleSheet.flatten(s.getByTestId("summary-share").props.style)?.flex).toBeUndefined();
  });

  it("loss: the same actions as a win, calm, with no Rematch or run-it-back prompt", async () => {
    const s = renderVerdict({ outcome: "loss", me: { athlete_id: "me", display_name: "Kai Reyes", elo_delta: -9, elo_before: 1498, elo_after: 1489 } });
    await flush();
    expect(s.queryByTestId("summary-rematch")).toBeNull();
    expect(s.queryByText(/rematch/i)).toBeNull();
    expect(s.queryByText("Run it back?")).toBeNull();
    s.getByTestId("summary-watch-film");
    s.getByTestId("summary-share");
    fireEvent.press(s.getByTestId("summary-exit"));
    expect(mockDismissTo).toHaveBeenCalledTimes(1);
    expect(mockDismissTo).toHaveBeenCalledWith(ARENA_HREF);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("draw: the same three actions", async () => {
    const s = renderVerdict({ outcome: "draw", me: { athlete_id: "me", display_name: "Kai Reyes", elo_before: 1500, elo_after: 1498, elo_delta: -2 } });
    await flush();
    s.getByTestId("summary-watch-film");
    s.getByTestId("summary-exit");
    s.getByTestId("summary-share");
    expect(s.queryByText(/rematch/i)).toBeNull();
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

  it("while this phone's clip uploads, the CTA is an ENABLED Open match (deck rule 4)", async () => {
    const s = renderVerdict({
      outcome: "loss",
      me: { athlete_id: "me", display_name: "Kai Reyes", elo_delta: -9, elo_before: 1498, elo_after: 1489 },
      upload: { kind: "uploading", message: null, truncation: null, progress: 0.64 },
    });
    await flush();
    const cta = s.getByTestId("summary-watch-film");
    expect(cta.props.accessibilityState.disabled).toBe(false);
    expect(s.getByText("Open match")).toBeTruthy();
    expect(s.queryByText("Watch film")).toBeNull();
    expect(s.getByText(/UPLOADING 64% · STILL ARRIVES AFTER UPLOAD/)).toBeTruthy();
    // The upload card replaced the banner over every post-live step.
    expect(s.getByTestId("upload-status-banner")).toBeTruthy();
    fireEvent.press(cta);
    expect(mockPush).toHaveBeenCalled();
  });

  it("a PAUSED upload is film still coming, never 'no film', and nothing offers playback (m10)", async () => {
    const s = renderVerdict({
      upload: { kind: "paused", message: "No connection right now. It picks up where it left off.", truncation: null, progress: 0.4, errorClass: "offline" },
    });
    await flush();
    expect(s.getByText("Open match")).toBeTruthy();
    expect(s.queryByText("Watch film")).toBeNull();
    expect(s.queryByText(/NO FILM/)).toBeNull();
    expect(s.getByText("UPLOAD PAUSED · 40%")).toBeTruthy();
    expect(s.getByTestId("upload-retry")).toBeTruthy();
  });

  it("a FAILED upload that a retry can still deliver is film still coming too", async () => {
    const s = renderVerdict({
      upload: { kind: "error", message: "The upload didn't finish.", truncation: null, progress: null, errorClass: "not_allowed" },
    });
    await flush();
    expect(s.getByText("Open match")).toBeTruthy();
    expect(s.queryByText(/NO FILM/)).toBeNull();
    expect(s.getByText("DIDN'T UPLOAD")).toBeTruthy();
  });

  it("a TERMINAL upload failure: Open match, grey, with Discard and no Try again", async () => {
    const s = renderVerdict({
      upload: { kind: "error", message: "This clip is too big to upload (2 GB max).", truncation: null, progress: null, errorClass: "too_large" },
    });
    await flush();
    expect(s.getByText("Open match")).toBeTruthy();
    expect(s.getByTestId("upload-discard")).toBeTruthy();
    expect(s.queryByTestId("upload-retry")).toBeNull();
  });

  it("a RECORDER failure (camera denied) is not an upload: no film is the truth", async () => {
    const s = renderVerdict({
      upload: { kind: "error", message: "Camera permission required", truncation: null, progress: null },
    });
    await flush();
    expect(s.getByText("Open match")).toBeTruthy();
    expect(s.getByText("NO FILM FOR THIS MATCH")).toBeTruthy();
  });

  it("after the upload lands, the still is processing, not 'after upload' (jits-n2im.4 item 6)", async () => {
    const s = renderVerdict({
      upload: { kind: "uploaded", message: null, truncation: null, progress: 1 },
      uploadedVideoId: "VID-1",
    });
    await flush();
    expect(s.getByText("PROCESSING FILM")).toBeTruthy();
    expect(s.queryByText(/AFTER UPLOAD/)).toBeNull();
    // A row exists but nothing plays yet.
    expect(s.getByText("Open match")).toBeTruthy();
  });

  it("Watch film only once an angle can play", async () => {
    mockDetailView.mockResolvedValue({ ok: true, data: { videos: [{ id: "v1", poster_url: null, playability: "processing" }] } });
    const s = renderVerdict();
    await flush();
    expect(s.getByText("Open match")).toBeTruthy();
    mockDetailView.mockResolvedValue({ ok: true, data: { videos: [{ id: "v1", poster_url: null, playability: "playable" }] } });
    const t = renderVerdict();
    await waitFor(() => expect(t.getByText("Watch film")).toBeTruthy());
  });

  it("no film at all: the CTA is Open match and the hero says so", async () => {
    const s = renderVerdict();
    await flush();
    expect(s.getByText("Open match")).toBeTruthy();
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
      data: { videos: [{ id: "v1", poster_url: "https://signed/poster.jpg", playability: "playable" }] },
    });
    const s = renderVerdict();
    await waitFor(() => expect(s.getByTestId("verdict-still")).toBeTruthy());
    expect(s.getByTestId("still-image").props.uri).toBe("https://signed/poster.jpg");
    expect(s.getByText("Watch film")).toBeTruthy();
  });

  it("caches the still under the poster's storage key in the Film Room's film-still- namespace", async () => {
    mockDetailView.mockResolvedValue({
      ok: true,
      data: {
        videos: [{ id: "v1", poster_url: "https://signed/poster.jpg?token=a", thumbnail_key: "matches/M1/v1/poster.jpg" }],
      },
    });
    const s = renderVerdict();
    await waitFor(() => expect(s.getByTestId("verdict-still")).toBeTruthy());
    expect(s.getByTestId("still-image").props.cacheKey).toBe("film-still-matches/M1/v1/poster.jpg");
  });

  it("falls back to the athletes with PROCESSING FILM while a video has no poster (jits-n2im.4 item 6)", async () => {
    // The video is on the server, so the upload is done: the still waits on
    // processing, never "after upload".
    mockDetailView.mockResolvedValue({ ok: true, data: { videos: [{ id: "v1", poster_url: null }] } });
    const s = renderVerdict();
    await waitFor(() => expect(s.getByText("PROCESSING FILM")).toBeTruthy());
    expect(s.queryByText(/STILL ARRIVES AFTER UPLOAD/)).toBeNull();
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
    expect(s.queryByTestId("summary-share")).toBeNull();
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

describe("status bar over the opening still", () => {
  type Source = ReturnType<typeof useWizardScrollSource>;
  function Harness({ children, sourceRef }: { children: React.ReactNode; sourceRef: { current: Source | null } }) {
    const source = useWizardScrollSource();
    sourceRef.current = source;
    return <WizardScrollContext.Provider value={source.value}>{children}</WizardScrollContext.Provider>;
  }
  const scrollTo = (source: Source, y: number) =>
    act(() => source.onScroll({ nativeEvent: { contentOffset: { x: 0, y } } } as never));
  const props = (): React.ComponentProps<typeof VerdictStep> => ({
    matchId: "M1",
    exitHref: ARENA_HREF,
    exitLabel: ARENA_EXIT_LABEL,
    matchStatus: "completed",
    outcome: "win",
    me: { athlete_id: "me", display_name: "Kai Reyes", elo_before: 1512, elo_after: 1526, elo_delta: 14 },
    opponent: { athlete_id: "opp", display_name: "Mina Park" },
    submissionName: null,
    finishTimeSeconds: null,
    upload: HIDDEN,
    uploadedVideoId: null,
  });

  afterEach(() => {
    mockScheme = "dark";
  });

  it("light over the still's dark scrim, then the app theme once the hero scrolls away (light theme)", async () => {
    mockScheme = "light";
    mockDetailView.mockResolvedValue({ ok: true, data: { videos: [{ id: "v1", poster_url: "https://signed/poster.jpg" }] } });
    const ref: { current: Source | null } = { current: null };
    const s = render(
      <Harness sourceRef={ref}>
        <VerdictStep {...props()} />
      </Harness>,
    );
    await waitFor(() => expect(s.getByTestId("verdict-still")).toBeTruthy());
    // Mounts at y 0 (the wizard resets the scroll on summary): pastHero is false.
    expect(mockStatusBar).toHaveBeenLastCalledWith("light");
    // HERO_HEIGHT 360 - 75 - top inset 0: where the bottom scrim is solid.
    scrollTo(ref.current!, 200);
    expect(mockStatusBar).toHaveBeenLastCalledWith("light");
    scrollTo(ref.current!, 300);
    expect(mockStatusBar).toHaveBeenLastCalledWith("dark");
    scrollTo(ref.current!, 0);
    expect(mockStatusBar).toHaveBeenLastCalledWith("light");
  });

  it("follows the app theme with no still (the themed fallback plate)", async () => {
    mockScheme = "light";
    const s = renderVerdict();
    await flush();
    expect(s.getByTestId("verdict-still-fallback")).toBeTruthy();
    expect(mockStatusBar).toHaveBeenLastCalledWith("dark");
  });
});

// Re-homed from the pre-redesign SummaryStep (the verdict replaced it).
describe("highlight note (spec 015 section 16.6.4)", () => {
  const NOTE = "Your highlight is being made, we'll let you know.";
  const ON = { ok: true, data: { clipsEnabled: true, shareEnabled: false } };
  const OFF = { ok: true, data: { clipsEnabled: false, shareEnabled: true } };
  const FAILED = { ok: false, error: { code: "UNKNOWN", message: "x" } };
  const UPLOADING = { kind: "uploading", message: null, truncation: null, progress: 0.4 } as const;
  const STOPPING = { kind: "stopping", message: null, truncation: null, progress: null } as const;

  it.each([
    ["clips on, video landed", ON, { uploadedVideoId: "v1" }, true],
    ["clips on, video uploading", ON, { upload: UPLOADING }, true],
    ["clips on, recorder stopping", ON, { upload: STOPPING }, true],
    ["clips on, no video", ON, {}, false],
    ["clips off, video landed", OFF, { uploadedVideoId: "v1" }, false],
    ["flag read failed (fail-closed)", FAILED, { uploadedVideoId: "v1" }, false],
  ] as const)("%s", async (_name, flags, video, shown) => {
    mockGetFlags.mockResolvedValue(flags);
    const s = renderVerdict(video as Partial<Props>);
    await flush();
    if (shown) {
      expect(s.getByTestId("summary-highlight-note")).toBeTruthy();
      expect(s.getByText(NOTE)).toBeTruthy();
    } else {
      expect(s.queryByTestId("summary-highlight-note")).toBeNull();
      expect(s.queryByText(NOTE)).toBeNull();
    }
  });

  it("is hidden on a disputed result, even with clips on and a video landed", async () => {
    mockGetFlags.mockResolvedValue(ON);
    const s = renderVerdict({ matchStatus: "disputed", uploadedVideoId: "v1" });
    await flush();
    expect(s.getByTestId("summary-verdict")).toHaveTextContent("DISPUTED");
    expect(s.queryByTestId("summary-highlight-note")).toBeNull();
    expect(s.queryByText(NOTE)).toBeNull();
  });

  it("is hidden on a disputed result while the clip is still uploading", async () => {
    mockGetFlags.mockResolvedValue(ON);
    const s = renderVerdict({ matchStatus: "disputed", upload: UPLOADING });
    await flush();
    expect(s.queryByTestId("summary-highlight-note")).toBeNull();
  });

  it("disappears when the opponent disputes while the verdict is on screen", async () => {
    mockGetFlags.mockResolvedValue(ON);
    const s = renderVerdict({ uploadedVideoId: "v1", confirmedAthleteIds: ["me"] });
    await flush();
    expect(s.getByTestId("summary-highlight-note")).toBeTruthy();
    act(() => mockSyncParams.onMatchDisputed?.("opp"));
    expect(s.getByTestId("summary-verdict")).toHaveTextContent("DISPUTED");
    expect(s.queryByTestId("summary-highlight-note")).toBeNull();
  });

  it("disappears when a re-read flips the match status to disputed", async () => {
    mockGetFlags.mockResolvedValue(ON);
    const s = renderVerdict({ uploadedVideoId: "v1", confirmedAthleteIds: ["me"] });
    await flush();
    expect(s.getByTestId("summary-highlight-note")).toBeTruthy();
    s.rerender(
      <VerdictStep
        matchId="M1"
        exitHref={ARENA_HREF}
        exitLabel={ARENA_EXIT_LABEL}
        matchStatus="disputed"
        outcome="win"
        me={{ athlete_id: "me", display_name: "Kai Reyes", elo_before: 1512, elo_after: 1526, elo_delta: 14, weight_division_gap: 0 }}
        opponent={{ athlete_id: "opp", display_name: "Mina Park" }}
        submissionName="Rear-naked choke"
        finishTimeSeconds={377}
        upload={HIDDEN}
        uploadedVideoId="v1"
        confirmedAthleteIds={["me"]}
      />,
    );
    await flush();
    expect(s.queryByTestId("summary-highlight-note")).toBeNull();
  });

  it("does not read the flags when there is no recording", async () => {
    mockGetFlags.mockResolvedValue(ON);
    renderVerdict();
    await flush();
    expect(mockGetFlags).not.toHaveBeenCalled();
  });

  it("is plain text, not a link", async () => {
    mockGetFlags.mockResolvedValue(ON);
    const s = renderVerdict({ uploadedVideoId: "v1" });
    await flush();
    expect(s.getByTestId("summary-highlight-note").props.accessibilityRole).toBeUndefined();
  });
});

describe("the other athlete's angle on the verdict (jits-n2im.12)", () => {
  const theirs = (over: Record<string, unknown> = {}) => ({
    id: "v-opp",
    uploaded_by: "opp",
    uploaded_by_name: "Mina Park",
    is_mine: false,
    status: "uploading",
    playability: "processing",
    upload_bytes_confirmed: 420,
    upload_bytes_total: 1000,
    upload_in_flight: true,
    poster_url: null,
    ...over,
  });

  it("shows it uploading with its percent, then ready once realtime reports the change", async () => {
    mockDetailView.mockResolvedValue({ ok: true, data: { videos: [theirs()] } });
    const s = renderVerdict();
    await flush();
    const row = s.getByTestId("verdict-angle-v-opp");
    expect(row).toHaveTextContent(/M\. PARK'S ANGLE/);
    expect(row).toHaveTextContent(/UPLOADING/);
    expect(row).toHaveTextContent(/42%/);
    expect(row.props.accessibilityRole).toBe("progressbar");
    expect(row.props.accessibilityValue).toEqual({ min: 0, max: 100, now: 42 });
    // Watch film only once something can play (deck rule 4).
    s.getByText("Open match");

    mockDetailView.mockResolvedValue({ ok: true, data: { videos: [theirs({ status: "ready", playability: "playable" })] } });
    const onChange = mockMatchVideosRealtime.mock.calls[mockMatchVideosRealtime.mock.calls.length - 1][2] as () => void;
    expect(mockMatchVideosRealtime.mock.calls[mockMatchVideosRealtime.mock.calls.length - 1][1]).toBe("M1");
    await act(async () => {
      onChange();
    });
    await flush();
    expect(s.getByTestId("verdict-angle-v-opp")).toHaveTextContent(/READY TO WATCH/);
    s.getByText("Watch film");
  });

  it("shows Processing between the upload and the pipeline", async () => {
    mockDetailView.mockResolvedValue({ ok: true, data: { videos: [theirs({ status: "merging" })] } });
    const s = renderVerdict();
    await flush();
    expect(s.getByTestId("verdict-angle-v-opp")).toHaveTextContent(/PROCESSING/);
  });

  it("never lists my own angle (this phone's upload card speaks for it)", async () => {
    mockDetailView.mockResolvedValue({ ok: true, data: { videos: [theirs({ id: "v-me", uploaded_by: "me", is_mine: true })] } });
    const s = renderVerdict();
    await flush();
    expect(s.queryByTestId("verdict-angle-rows")).toBeNull();
  });
});

describe("the verdict Film block (jits-n2im.25): the same plate as match detail", () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const filmMock = require("../../support/film-status-mock") as typeof import("../../support/film-status-mock");
  const fx = require("../../support/match-video-status-fixture") as typeof import("../../support/match-video-status-fixture");
  const { deriveFilmStatus } = require("@/lib/video/film-status") as typeof import("@/lib/video/film-status");
  /* eslint-enable @typescript-eslint/no-require-imports */
  const derive = (over: Record<string, unknown>) => {
    const status = fx.statusFixture(over);
    return { status, view: deriveFilmStatus({ status, viewerId: fx.ME, local: null, nowMs: fx.NOW, clockOffsetMs: 0 }) };
  };
  afterEach(() => filmMock.setMockFilmStatus(null));

  it("replaces the upload card, the angle rows and the highlight note", async () => {
    mockGetFlags.mockResolvedValue({ ok: true, data: { clipsEnabled: true, shareEnabled: false } });
    filmMock.setMockFilmStatus(derive({ angles: [fx.angle("me", "uploading", { progress_pct: 42 }), fx.angle("opp", "waiting_for_phone")] }));
    const s = renderVerdict({ upload: { kind: "uploading", message: null, truncation: null, progress: 0.42 } });
    await flush();
    expect(s.getByTestId("verdict-film")).toBeTruthy();
    expect(s.getByText("FILM")).toBeTruthy();
    expect(s.getByText("Film is coming in from 2 phones.")).toBeTruthy();
    expect(s.queryByTestId("upload-status-banner")).toBeNull();
    expect(s.queryByTestId("verdict-angle-rows")).toBeNull();
    expect(s.queryByTestId("summary-highlight-note")).toBeNull();
    // Nothing is ready: Open match, never Watch film (rule 4).
    expect(s.getByText("Open match")).toBeTruthy();
  });

  it("Watch film once the status has a ready angle, even before the detail read says playable", async () => {
    filmMock.setMockFilmStatus(derive({ phase: "building", phase_reason: null, angles: [fx.angle("me", "ready"), fx.angle("opp", "processing")] }));
    const s = renderVerdict();
    await flush();
    expect(s.getByText("Watch film")).toBeTruthy();
  });

  it("Watch film as soon as an angle has playable bytes, before its analysis (rule 4 reads playable)", async () => {
    const status = fx.statusFixture({ angles: [fx.angle("me", "processing"), fx.angle("opp", "uploading")] });
    const view = deriveFilmStatus({ status, viewerId: fx.ME, local: null, nowMs: fx.NOW, clockOffsetMs: 0, playable: new Map([[fx.V_ME, 271]]) });
    filmMock.setMockFilmStatus({ status, view });
    const s = renderVerdict();
    await flush();
    expect(s.getByText("Watch film")).toBeTruthy();
    expect(s.getByText("ANALYZING")).toBeTruthy();
  });

  it("an angle still merging (no playable bytes) is not a reason to offer Watch film", async () => {
    filmMock.setMockFilmStatus(derive({ angles: [fx.angle("me", "processing"), fx.angle("opp", "uploading")] }));
    const s = renderVerdict();
    await flush();
    expect(s.getByText("Open match")).toBeTruthy();
  });

  it("keeps the card only for recorder states the block has no row for", async () => {
    filmMock.setMockFilmStatus(derive({ angles: [fx.angle("me", "waiting_for_phone"), fx.angle("opp", "uploading")] }));
    const s = renderVerdict({ upload: { kind: "stopping", message: null, truncation: null, progress: null } });
    await flush();
    expect(s.getByTestId("upload-status-banner")).toBeTruthy();
    expect(s.getByTestId("verdict-film")).toBeTruthy();
  });

  it("the hero agrees with the block: 'No video yet' in the grace window, never 'No film' early", async () => {
    filmMock.setMockFilmStatus(derive({ phase: "collecting", phase_reason: "no_video_yet", angles: [fx.angle("me", "not_recording"), fx.angle("opp", "not_recording")] }));
    const s = renderVerdict();
    await flush();
    // The phase tag and the hero caption say the same words.
    expect(s.getAllByText("NO VIDEO YET")).toHaveLength(2);
    expect(s.queryByText("NO FILM FOR THIS MATCH")).toBeNull();
  });
});
