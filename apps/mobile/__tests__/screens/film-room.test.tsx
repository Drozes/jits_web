import * as React from "react";
import { act, configure, fireEvent, render, waitFor, within } from "@testing-library/react-native";

// Heavy screen renders: under a loaded machine (parallel agents, the
// pre-commit hook running every workspace at once) the defaults (5 s per
// test, 1 s per waitFor) timed out while the suite passes alone in ~15 s.
// Generous ceilings keep the gate load-insensitive without slowing a pass.
jest.setTimeout(30_000);
configure({ asyncUtilTimeout: 5_000 });

type HostNode = ReturnType<typeof render>["UNSAFE_root"];

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn(), canGoBack: () => true }),
  useFocusEffect: jest.fn(),
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("lucide-react-native", () => {
  const RN = require("react-native");
  const R = require("react");
  const stub = () => R.createElement(RN.View, { testID: "icon" });
  return new Proxy({}, { get: (_t: unknown, p: string) => (p === "__esModule" ? true : stub) });
});
jest.mock("expo-image", () => {
  const R = require("react");
  const RN = require("react-native");
  return { Image: (props: Record<string, unknown>) => R.createElement(RN.View, props) };
});
jest.mock("@/components/ui/skeleton", () => {
  const R = require("react");
  const RN = require("react-native");
  const Pass = ({ children }: { children?: React.ReactNode }) => R.createElement(RN.View, null, children);
  return { SkeletonProvider: Pass, SkeletonBlock: () => R.createElement(RN.View) };
});
jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
jest.mock("@/lib/theme/use-theme", () => ({
  useResolvedColorScheme: () => "light",
  useThemedTokens: () => ({ accentCta: "#E63946", textSecondary: "#4B5563" }),
}));
jest.mock("@/lib/auth/hooks", () => ({
  useRequireAthlete: () => ({
    athlete: { id: mockAthleteId(), display_name: "Kai Reyes", current_elo: 1526, primary_gym_id: null, profile_photo_url: null },
  }),
}));
jest.mock("@/lib/profile/use-profile-data", () => ({
  useProfileData: () => ({
    history: [
      ...Array.from({ length: 15 }, () => ({ athlete_outcome: "win" })),
      ...Array.from({ length: 7 }, () => ({ athlete_outcome: "loss" })),
      ...Array.from({ length: 2 }, () => ({ athlete_outcome: "draw" })),
    ],
  }),
}));
const mockGetMyMatchLibrary = jest.fn();
jest.mock("@jits/shared/api/film-room", () => ({
  getMyMatchLibrary: (...a: unknown[]) => mockGetMyMatchLibrary(...a),
}));

// The library's first page is cached per athlete: a fresh athlete per test.
let mockSeq = 0;
function mockAthleteId() {
  return `film-ath-${mockSeq}`;
}

import AsyncStorage from "@react-native-async-storage/async-storage";
import FilmRoomScreen from "@/app/(app)/film-room";
import { __resetSeenMatches, loadSeenMatches, markMatchSeen } from "@/lib/film-room/seen-store";
import { resetMatchUploadStore, setMatchUpload } from "@/lib/video/match-upload-store";
import { libItem, libVideo } from "../support/film-fixtures";

const NOW = new Date();
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

function page(items: ReturnType<typeof libItem>[], next: string | null = null) {
  return { ok: true, data: { items, next_before: next, next_before_id: next ? "id-" + next : null, source: "rpc" } };
}

const PARK = { id: "opp-1", display_name: "Mina Park", profile_photo_url: null };
const SILVA = { id: "opp-2", display_name: "Joao Silva", profile_photo_url: null };

function library() {
  return [
    libItem({ match_id: "m-new", completed_at: daysAgo(0), opponent: PARK }),
    libItem({ match_id: "m-analyzing", completed_at: daysAgo(0), outcome: "loss", elo_delta: -11, opponent: SILVA, videos: [libVideo({ status: "analyzing", has_analysis: false, chunk_count: 7, chunks_completed: 3 })] }),
    libItem({ match_id: "m-ready", completed_at: daysAgo(0), outcome: "draw", elo_delta: 1, opponent: PARK, videos: [libVideo(), libVideo({ video_id: "v-2", uploaded_by: "opp-1" })] }),
    libItem({ match_id: "m-failed", completed_at: daysAgo(0), opponent: SILVA, videos: [libVideo({ status: "failed", playability: "failed", has_analysis: false, poster_url: null })] }),
    libItem({ match_id: "m-up", completed_at: daysAgo(0), opponent: PARK, videos: [] }),
  ];
}

// Each test mounts the whole grid (about 0.8 s alone), and renderLoaded
// waits up to 5 s for it. With the default 5 s per-test timeout the RUNNER's
// timeout fired first under a loaded parallel run, failing a test whose
// waitFor would still have passed. The per-test budget must exceed the
// waits inside it.
jest.setTimeout(20_000);

async function renderLoaded(result: unknown = page(library())) {
  mockGetMyMatchLibrary.mockResolvedValue(result);
  const utils = render(<FilmRoomScreen />);
  // The first page resolves on a microtask, but the whole grid mounts before
  // the skeleton goes: under a full parallel run that can pass the 1 s
  // waitFor default, so give it room.
  await waitFor(() => expect(utils.queryByTestId("film-room-loading")).toBeNull(), { timeout: 5000 });
  return utils;
}

function badgeOf(utils: ReturnType<typeof render>, matchId: string): string | null {
  const card = utils.getByTestId(`film-card-${matchId}`);
  const badge = within(card).queryByTestId("film-card-badge");
  if (!badge) return null;
  const text = within(badge).UNSAFE_getByType(require("react-native").Text);
  return text.props.children as string;
}

beforeEach(async () => {
  jest.clearAllMocks();
  mockSeq += 1;
  __resetSeenMatches();
  resetMatchUploadStore();
  await AsyncStorage.clear();
  // Read the (empty) seen set up front so its async load never lands mid-test.
  await loadSeenMatches();
});

describe("FilmRoomScreen", () => {
  it("shows the header, the record strip and a skeleton while the first page loads", () => {
    mockGetMyMatchLibrary.mockReturnValue(new Promise(() => undefined));
    const utils = render(<FilmRoomScreen />);
    expect(utils.getByText("FILM ROOM")).toBeTruthy();
    expect(utils.getByTestId("film-room-record")).toHaveTextContent("24 MATCHES · 15W 7L 2D · 1526");
    expect(utils.getByTestId("film-room-loading")).toBeTruthy();
    expect(utils.getByLabelText("Go back")).toBeTruthy();
  });

  it("groups posters under a month heading and opens the match page", async () => {
    const utils = await renderLoaded();
    const month = NOW.toLocaleString("en-US", { month: "long" }).toUpperCase();
    expect(utils.getByText(`${month} ${NOW.getFullYear()}`)).toBeTruthy();
    expect(utils.getByText("5 MATCHES")).toBeTruthy();
    const card = utils.getByTestId("film-card-m-new");
    expect(card.props.accessibilityLabel).toMatch(/^Won vs M\. Park, [A-Z]{3} \d{2}, ▲ \+14 · 06:17, NEW$/);
    fireEvent.press(card);
    expect(mockPush).toHaveBeenCalledWith("/(app)/match-detail/m-new");
  });

  it("shows every status: NEW, ANALYZING n/m, BREAKDOWN READY, FAILED, 2 ANGLES, UPLOADING %", async () => {
    markMatchSeen("m-ready");
    act(() => {
      setMatchUpload("m-up", { status: "uploading", progress: 0.64 });
    });
    const utils = await renderLoaded();
    await waitFor(() => expect(badgeOf(utils, "m-new")).toBe("NEW"));
    expect(badgeOf(utils, "m-analyzing")).toBe("ANALYZING 3/7");
    expect(badgeOf(utils, "m-ready")).toBe("BREAKDOWN READY");
    expect(badgeOf(utils, "m-failed")).toBe("FAILED");
    expect(within(utils.getByTestId("film-card-m-ready")).getByText("2 ANGLES")).toBeTruthy();
    expect(within(utils.getByTestId("film-card-m-new")).queryByText("2 ANGLES")).toBeNull();
    const uploading = utils.getByTestId("film-card-m-up");
    expect(within(uploading).getByText("UPLOADING 64%")).toBeTruthy();
    expect(within(uploading).getByTestId("film-card-progress").props.style).toMatchObject({ width: "64%" });

    act(() => {
      setMatchUpload("m-up", { progress: 0.9 });
    });
    expect(within(utils.getByTestId("film-card-m-up")).getByText("UPLOADING 90%")).toBeTruthy();
  });

  it("re-renders only the uploading poster on a progress tick", async () => {
    act(() => {
      setMatchUpload("m-up", { status: "uploading", progress: 0.1 });
    });
    const utils = await renderLoaded();
    await waitFor(() => expect(within(utils.getByTestId("film-card-m-up")).getByText("UPLOADING 10%")).toBeTruthy());
    const cardStatus = require("@/lib/film-room/card-status");
    const spy = jest.spyOn(cardStatus, "deriveCardStatus");
    act(() => {
      setMatchUpload("m-up", { progress: 0.5 });
    });
    expect(within(utils.getByTestId("film-card-m-up")).getByText("UPLOADING 50%")).toBeTruthy();
    expect(spy.mock.calls.map((c) => (c[0] as { match_id: string }).match_id)).toEqual(["m-up"]);
    spy.mockClear();
    act(() => {
      setMatchUpload("some-other-match", { status: "uploading", progress: 0.5 });
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it("marks a disputed match on its poster", async () => {
    const utils = await renderLoaded(page([libItem({ match_id: "m-d", status: "disputed" })]));
    expect(within(utils.getByTestId("film-card-m-d")).getByTestId("film-card-disputed")).toBeTruthy();
  });

  it("uses the signed still when there is one and the avatar plate otherwise", async () => {
    const utils = await renderLoaded();
    const still = within(utils.getByTestId("film-card-m-new")).getByTestId("opening-still");
    expect(still.props.source).toEqual({ uri: "https://signed/k.jpg", cacheKey: "film-still-k.jpg" });
    const failed = utils.getByTestId("film-card-m-failed");
    expect(within(failed).getByTestId("opening-still-fallback")).toBeTruthy();
    expect(within(failed).getByText("FILM FAILED TO PROCESS")).toBeTruthy();
    expect(within(utils.getByTestId("film-card-m-up")).getByText("NO FILM RECORDED")).toBeTruthy();
  });

  it("filters by result", async () => {
    const utils = await renderLoaded();
    fireEvent.press(utils.getByTestId("film-filter-loss"));
    expect(utils.getByTestId("film-card-m-analyzing")).toBeTruthy();
    expect(utils.queryByTestId("film-card-m-new")).toBeNull();
    expect(utils.getByTestId("film-filter-loss").props.accessibilityState).toMatchObject({ selected: true });

    fireEvent.press(utils.getByTestId("film-filter-draw"));
    expect(utils.getByTestId("film-card-m-ready")).toBeTruthy();
    expect(utils.queryByTestId("film-card-m-analyzing")).toBeNull();

    fireEvent.press(utils.getByTestId("film-filter-all"));
    expect(utils.getByTestId("film-card-m-new")).toBeTruthy();
  });

  it("filters by opponent through the picker", async () => {
    const utils = await renderLoaded();
    fireEvent.press(utils.getByTestId("film-filter-opponent"));
    expect(utils.getByTestId("film-opponent-sheet")).toBeTruthy();
    fireEvent.press(utils.getByTestId("film-opponent-opp-2"));
    expect(utils.getByTestId("film-card-m-analyzing")).toBeTruthy();
    expect(utils.getByTestId("film-card-m-failed")).toBeTruthy();
    expect(utils.queryByTestId("film-card-m-new")).toBeNull();
    expect(utils.getByText("vs J. Silva ▾")).toBeTruthy();

    fireEvent.press(utils.getByTestId("film-filter-opponent"));
    fireEvent.press(utils.getByTestId("film-opponent-any"));
    expect(utils.getByTestId("film-card-m-new")).toBeTruthy();
  });

  it("exposes the result chips as selectable tabs with 44 pt targets", async () => {
    const utils = await renderLoaded();
    const wins = utils.getByTestId("film-filter-win");
    expect(wins.props.accessibilityRole).toBe("tab");
    expect(utils.getByTestId("film-filter-all").props.accessibilityState).toMatchObject({ selected: true });
    const flat = Object.assign({}, ...[].concat(wins.props.style));
    expect(flat.height + wins.props.hitSlop.top + wins.props.hitSlop.bottom).toBeGreaterThanOrEqual(44);
    expect(utils.getByTestId("film-filter-opponent").props.accessibilityRole).toBe("button");
  });

  it("offers to clear a filter with no matches", async () => {
    const utils = await renderLoaded(page([libItem({ match_id: "only-win" })]));
    fireEvent.press(utils.getByTestId("film-filter-loss"));
    expect(utils.getByTestId("film-room-empty-filtered")).toBeTruthy();
    fireEvent.press(utils.getByLabelText("Show all"));
    expect(utils.getByTestId("film-card-only-win")).toBeTruthy();
  });

  it("pages through next_before when the list end is reached", async () => {
    mockGetMyMatchLibrary
      .mockResolvedValueOnce(page([libItem({ match_id: "p1", completed_at: daysAgo(1) })], "cursor-1"))
      .mockResolvedValueOnce(page([libItem({ match_id: "p2", completed_at: daysAgo(40) })], null));
    const utils = render(<FilmRoomScreen />);
    await waitFor(() => expect(utils.getByTestId("film-card-p1")).toBeTruthy());
    const list = utils.UNSAFE_root.find((n: HostNode) => typeof n.props.onEndReached === "function");
    await act(async () => {
      list.props.onEndReached();
    });
    await waitFor(() => expect(utils.getByTestId("film-card-p2")).toBeTruthy());
    expect(mockGetMyMatchLibrary).toHaveBeenLastCalledWith({}, mockAthleteId(), { limit: 20, before: "cursor-1", beforeId: "id-cursor-1" });
  });

  it("omits the count on the oldest loaded month while more pages exist", async () => {
    const utils = await renderLoaded(page([libItem({ match_id: "p1", completed_at: daysAgo(0) })], "cursor-1"));
    expect(utils.getByTestId("film-card-p1")).toBeTruthy();
    expect(utils.queryByText("1 MATCH")).toBeNull();
    const done = await renderLoaded(page([libItem({ match_id: "p2", completed_at: daysAgo(0) })]));
    expect(done.getByText("1 MATCH")).toBeTruthy();
  });

  it("shows the empty state for an athlete with no matches", async () => {
    const utils = await renderLoaded(page([]));
    expect(utils.getByTestId("film-room-empty")).toBeTruthy();
    expect(utils.getByText("NO FILM YET")).toBeTruthy();
  });

  it("shows a retryable error when the first page fails", async () => {
    const utils = await renderLoaded({ ok: false, error: { code: "UNKNOWN", message: "offline" } });
    expect(utils.getByTestId("film-room-error")).toBeTruthy();
    mockGetMyMatchLibrary.mockResolvedValue(page(library()));
    await act(async () => {
      fireEvent.press(utils.getByLabelText("Try again"));
    });
    await waitFor(() => expect(utils.getByTestId("film-card-m-new")).toBeTruthy());
  });

  it("never uses an em dash in its copy", () => {
    const fs = require("fs") as typeof import("fs");
    const path = require("path") as typeof import("path");
    const root = path.join(__dirname, "../..");
    const files = [
      "app/(app)/film-room.tsx",
      "app/(app)/video/[id].tsx",
      "app/(app)/match-detail/[matchId].tsx",
      // Recursive: the multi-angle player's components live in a subfolder.
      ...(fs.readdirSync(path.join(root, "components/film-room"), { recursive: true }) as string[])
        .filter((f) => /\.tsx?$/.test(f))
        .map((f) => `components/film-room/${f}`),
      "components/match-detail/ai-breakdown.tsx",
      "components/match-detail/key-moments.tsx",
      "components/match-detail/film-angles.tsx",
      "components/match-detail/match-hero.tsx",
      "components/match-detail/match-verdict.tsx",
      "components/profile/film-room-preview.tsx",
    ];
    for (const f of files) {
      expect(fs.readFileSync(path.join(root, f), "utf8")).not.toContain("—");
    }
  });
});
