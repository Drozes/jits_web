/** The swipe viewer's entry API (jits-a4fw.5, spec 8.1). */
const mockPush = jest.fn();
jest.mock("expo-router", () => ({ router: { push: (...a: unknown[]) => mockPush(...a) } }));
jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));

import {
  __resetReelSessionsForTests,
  createReelSession,
  getReelSession,
  laneSource,
  openReelViewer,
  parseReelLane,
  reelViewerHref,
} from "@/lib/highlight/reel-viewer-session";
import { resetHighlightStore } from "@/lib/highlight/highlight-store";
import { reel } from "../../support/reel-fixtures";

beforeEach(() => {
  mockPush.mockClear();
  __resetReelSessionsForTests();
});

describe("openReelViewer", () => {
  it("parks the lane and pushes the tapped reel with lane and session params", () => {
    const loadMore = jest.fn();
    const token = openReelViewer({ items: [reel(1), reel(2), reel(3)], startIndex: 1, lane: "matches", loadMore });
    expect(token).toEqual(expect.any(String));
    expect(mockPush).toHaveBeenCalledWith(`/highlight/h2?source=matches&lane=matches&session=${token}`);
    const session = getReelSession(token!);
    expect(session).toMatchObject({ lane: "matches", startIndex: 1, loadMore });
    expect(session!.items.map((r) => r.highlightId)).toEqual(["h1", "h2", "h3"]);
  });

  it("an empty lane opens nothing", () => {
    expect(openReelViewer({ items: [], startIndex: 0, lane: "home" })).toBeNull();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("clamps the start index and copies the list", () => {
    const items = [reel(1), reel(2)];
    const s = createReelSession({ items, startIndex: 9, lane: "home" })!;
    expect(s.startIndex).toBe(1);
    items.push(reel(3));
    expect(s.items).toHaveLength(2);
  });

  it("an unknown or expired token resolves to no session (single-reel fallback)", () => {
    expect(getReelSession("nope")).toBeNull();
    expect(getReelSession(undefined)).toBeNull();
    const first = createReelSession({ items: [reel(1)], startIndex: 0, lane: "home" })!;
    for (let i = 0; i < 5; i++) createReelSession({ items: [reel(i)], startIndex: 0, lane: "home" });
    expect(getReelSession(first.token)).toBeNull();
    const kept = createReelSession({ items: [reel(9)], startIndex: 0, lane: "home" })!;
    expect(getReelSession([kept.token, "x"])).toBe(kept);
  });

  it("href, lane parsing and the funnel source", () => {
    expect(reelViewerHref("a/b", "home", "t 1")).toBe("/highlight/a%2Fb?source=home&lane=home&session=t%201");
    expect(parseReelLane("home")).toBe("home");
    expect(parseReelLane(["matches"])).toBe("matches");
    expect(parseReelLane("push")).toBeNull();
    expect(parseReelLane(undefined)).toBeNull();
    expect(laneSource("matches")).toBe("matches");
  });

  it("sign-out (resetHighlightStore) forgets every lane session", () => {
    const s = createReelSession({ items: [reel(1)], startIndex: 0, lane: "home" })!;
    resetHighlightStore();
    expect(getReelSession(s.token)).toBeNull();
  });
});
