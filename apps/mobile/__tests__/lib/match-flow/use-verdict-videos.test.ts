/**
 * The verdict's videos (jits-n2im.12 / .15): realtime replaced the poster
 * poll, the poster comes from the primary angle, and the other athletes'
 * angles are handed to the verdict rows.
 */
import { renderHook, act, waitFor } from "@testing-library/react-native";

const mockGetView = jest.fn();
jest.mock("@/lib/supabase/client", () => ({ supabase: { tag: "client" } }));
jest.mock("@jits/shared/api/queries", () => ({
  getMatchDetailView: (...a: unknown[]) => mockGetView(...a),
}));
jest.mock("@jits/shared/api/match-rank-change", () => ({ getMatchRankChange: jest.fn() }));
const mockRealtime: { matchId: string | null; onChange: (() => void) | null } = { matchId: null, onChange: null };
jest.mock("@jits/shared/hooks/use-match-videos-realtime", () => ({
  useMatchVideosRealtime: (_sb: unknown, matchId: string | null, onChange: () => void) => {
    mockRealtime.matchId = matchId;
    mockRealtime.onChange = onChange;
  },
}));

import * as verdictData from "@/lib/match-flow/use-verdict-data";
import { useVerdictVideos } from "@/lib/match-flow/use-verdict-data";

function video(over: Record<string, unknown> = {}) {
  return {
    id: "v-mine",
    uploaded_by: "me",
    uploaded_by_name: "Me Myself",
    status: "ready",
    playability: "playable",
    is_mine: true,
    poster_url: null,
    thumbnail_key: null,
    is_primary: false,
    ...over,
  };
}

function view(videos: unknown[]) {
  return { ok: true, data: { videos } };
}

beforeEach(() => {
  mockGetView.mockReset();
  mockRealtime.matchId = null;
  mockRealtime.onChange = null;
});

it("no longer exports or runs a poster poll", () => {
  expect(Object.keys(verdictData).filter((k) => /POSTER_POLL|posterPoll/.test(k))).toEqual([]);
});

it("subscribes to the match and re-reads on a realtime change", async () => {
  mockGetView.mockResolvedValueOnce(view([]));
  const { result } = renderHook(() => useVerdictVideos("M1", "me", null));
  await waitFor(() => expect(mockGetView).toHaveBeenCalledTimes(1));
  expect(mockRealtime.matchId).toBe("M1");
  expect(result.current.others).toEqual([]);

  // The opponent reserves their angle: an INSERT arrives.
  mockGetView.mockResolvedValueOnce(
    view([video({ id: "v-opp", uploaded_by: "opp", is_mine: false, status: "uploading", playability: "processing" })]),
  );
  act(() => mockRealtime.onChange?.());
  await waitFor(() => expect(result.current.others.map((v) => v.id)).toEqual(["v-opp"]));
  expect(result.current.hasVideo).toBe(true);
  expect(result.current.hasPlayable).toBe(false);
});

it("takes the poster from the server-elected primary", async () => {
  mockGetView.mockResolvedValueOnce(
    view([
      video({ poster_url: "https://mine", thumbnail_key: "k-mine" }),
      video({ id: "v-opp", uploaded_by: "opp", is_mine: false, is_primary: true, poster_url: "https://opp", thumbnail_key: "k-opp" }),
    ]),
  );
  const { result } = renderHook(() => useVerdictVideos("M1", "me", null));
  await waitFor(() => expect(result.current.posterUrl).toBe("https://opp"));
  expect(result.current.posterKey).toBe("k-opp");
});

it("falls back to the first poster when nothing is elected or the primary has none yet", async () => {
  mockGetView.mockResolvedValueOnce(
    view([
      video({ poster_url: "https://mine", thumbnail_key: "k-mine" }),
      video({ id: "v-opp", uploaded_by: "opp", is_mine: false, is_primary: true, poster_url: null }),
    ]),
  );
  const { result } = renderHook(() => useVerdictVideos("M1", "me", null));
  await waitFor(() => expect(result.current.posterUrl).toBe("https://mine"));
});
