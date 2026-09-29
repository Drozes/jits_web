/**
 * Bell lists (jits-dq85.8): only FRESH pending challenges (inside
 * ARENA_CHALLENGE_FRESH_MS of their createdAt) count; older ones go to
 * "Missed"; rows route to the Arena / match detail / the reel viewer, never
 * the retired /session path (jits-r01i).
 */
import { ARENA_CHALLENGE_FRESH_MS } from "@jits/shared/constants";
import type { PendingChallenge } from "@jits/shared/hooks/use-pending-challenges";
import type { NotificationItem } from "@jits/shared/types/notification";
import {
  bellItemRoute,
  buildBellLists,
  isFreshPendingChallenge,
  nextFreshnessChangeAt,
  pendingChallengeToBellItem,
  splitPendingByFreshness,
  type HighlightNotificationItem,
} from "@/lib/notifications/notification-items";
import {
  __resetServerClockForTests,
  freshDeadline,
  noteServerTime,
} from "@/lib/arena/incoming-challenges";

afterEach(() => {
  __resetServerClockForTests();
});

const NOW = Date.parse("2026-09-28T12:00:00Z");
const MIN = 60_000;

function pending(id: string, ageMs: number, over: Partial<PendingChallenge> = {}): PendingChallenge {
  return {
    id,
    challengerName: `Name ${id}`,
    matchType: "ranked",
    createdAt: new Date(NOW - ageMs).toISOString(),
    expiresAt: new Date(NOW + 7 * 24 * 60 * MIN).toISOString(),
    ...over,
  };
}

describe("isFreshPendingChallenge", () => {
  it("is fresh up to one ms before the boundary and stale at it (the Arena's freshDeadline rule)", () => {
    expect(isFreshPendingChallenge(pending("a", 0), NOW)).toBe(true);
    expect(isFreshPendingChallenge(pending("a", ARENA_CHALLENGE_FRESH_MS - 1), NOW)).toBe(true);
    expect(isFreshPendingChallenge(pending("a", ARENA_CHALLENGE_FRESH_MS), NOW)).toBe(false);
    expect(isFreshPendingChallenge(pending("a", ARENA_CHALLENGE_FRESH_MS + 1), NOW)).toBe(false);
    expect(isFreshPendingChallenge(pending("a", 2 * 60 * MIN), NOW)).toBe(false);
  });

  it("an expiresAt sooner than the 10-minute window ends it there, like the Arena", () => {
    const c = pending("a", MIN, { expiresAt: new Date(NOW + MIN).toISOString() });
    expect(isFreshPendingChallenge(c, NOW + MIN - 1)).toBe(true);
    expect(isFreshPendingChallenge(c, NOW + MIN)).toBe(false);
    expect(freshDeadline(c)).toBe(NOW + MIN);
  });

  it("an undatable challenge is never fresh", () => {
    expect(isFreshPendingChallenge({ createdAt: "not a date" }, NOW)).toBe(false);
    expect(isFreshPendingChallenge({ createdAt: "" }, NOW)).toBe(false);
  });
});

describe("splitPendingByFreshness / nextFreshnessChangeAt", () => {
  const list = [pending("f1", 1 * MIN), pending("old", 2 * 60 * MIN), pending("f2", 4 * MIN)];

  it("splits fresh from missed", () => {
    const { fresh, missed } = splitPendingByFreshness(list, NOW);
    expect(fresh.map((c) => c.id)).toEqual(["f1", "f2"]);
    expect(missed.map((c) => c.id)).toEqual(["old"]);
  });

  it("the next change is the first ms the OLDEST fresh one is stale", () => {
    const at = nextFreshnessChangeAt(list, NOW)!;
    expect(at).toBe(NOW - 4 * MIN + ARENA_CHALLENGE_FRESH_MS);
    expect(splitPendingByFreshness(list, at - 1).fresh.map((c) => c.id)).toEqual(["f1", "f2"]);
    expect(splitPendingByFreshness(list, at).fresh.map((c) => c.id)).toEqual(["f1"]);
  });

  it("with nothing fresh, the next change is the soonest expiry; null with nothing listed", () => {
    const old = pending("old", 2 * 60 * MIN, { expiresAt: new Date(NOW + 30 * MIN).toISOString() });
    expect(nextFreshnessChangeAt([old], NOW)).toBe(NOW + 30 * MIN);
    expect(nextFreshnessChangeAt([], NOW)).toBeNull();
    const expired = pending("gone", 2 * 60 * MIN, { expiresAt: new Date(NOW - 1).toISOString() });
    expect(nextFreshnessChangeAt([expired], NOW)).toBeNull();
  });

  it("an expiry sooner than the freshness boundary wins", () => {
    const c = pending("f", 1 * MIN, { expiresAt: new Date(NOW + MIN).toISOString() });
    expect(nextFreshnessChangeAt([c], NOW)).toBe(NOW + MIN);
  });

  it("drops challenges at or past their expiresAt from both lists", () => {
    const expiredOld = pending("x-old", 2 * 60 * MIN, { expiresAt: new Date(NOW - MIN).toISOString() });
    const expiringNow = pending("x-now", 1 * MIN, { expiresAt: new Date(NOW).toISOString() });
    const { fresh, missed } = splitPendingByFreshness([...list, expiredOld, expiringNow], NOW);
    expect(fresh.map((c) => c.id)).toEqual(["f1", "f2"]);
    expect(missed.map((c) => c.id)).toEqual(["old"]);
  });

  it("keeps a challenge with an undatable expiresAt (the server owns expiry)", () => {
    const c = pending("u", 2 * 60 * MIN, { expiresAt: "garbage" });
    expect(splitPendingByFreshness([c], NOW).missed.map((x) => x.id)).toEqual(["u"]);
  });
});

describe("pendingChallengeToBellItem", () => {
  it("matches the history row's id and copy and carries the challenge id", () => {
    expect(pendingChallengeToBellItem(pending("c1", MIN, { challengerName: "Alex" }))).toEqual({
      id: "challenge-recv-c1",
      type: "challenge_received",
      title: "Challenge Received",
      body: "Alex sent you a ranked challenge",
      challengeId: "c1",
      createdAt: new Date(NOW - MIN).toISOString(),
    });
    expect(pendingChallengeToBellItem(pending("c2", MIN, { matchType: "casual" })).body).toMatch(/casual challenge$/);
  });

  it("marks a fresh row unread and leaves a Missed row unmarked", () => {
    expect(pendingChallengeToBellItem(pending("c1", MIN), true).unread).toBe(true);
    expect("unread" in pendingChallengeToBellItem(pending("c1", MIN))).toBe(false);
  });
});

describe("buildBellLists", () => {
  const history: NotificationItem[] = [
    // History's own pending row: replaced by the realtime pending list.
    { id: "challenge-recv-old", type: "challenge_received", title: "t", body: "b", challengeId: "old", createdAt: new Date(NOW - 2 * 60 * MIN).toISOString() },
    { id: "challenge-accepted-x", type: "challenge_accepted", title: "t", body: "b", challengeId: "x", createdAt: new Date(NOW - 30 * MIN).toISOString() },
    { id: "match-m1", type: "match_result", title: "t", body: "b", matchId: "m1", createdAt: new Date(NOW - 3 * 60 * MIN).toISOString() },
  ];
  const reel: HighlightNotificationItem = {
    type: "highlight_ready",
    id: "highlight-h1-v1",
    title: "Your highlight is ready",
    body: "x",
    route: "/highlight/h1?source=bell",
    createdAt: new Date(NOW - 5 * MIN).toISOString(),
    unread: true,
  };

  it("feed has fresh pending, answered history and reels newest first; missed has the stale pending", () => {
    const { feed, missed } = buildBellLists(
      history,
      [reel],
      [pending("fresh", 2 * MIN), pending("old", 2 * 60 * MIN), pending("older", 5 * 60 * MIN)],
      NOW,
    );
    expect(feed.map((i) => i.id)).toEqual([
      "challenge-recv-fresh",
      "highlight-h1-v1",
      "challenge-accepted-x",
      "match-m1",
    ]);
    expect(missed.map((i) => i.id)).toEqual(["challenge-recv-old", "challenge-recv-older"]);
    // The badge counts the fresh challenge, so its row carries the unread
    // mark; Missed rows and answered history do not.
    expect(feed.find((i) => i.id === "challenge-recv-fresh")?.unread).toBe(true);
    expect(feed.find((i) => i.id === "challenge-accepted-x")?.unread).toBeUndefined();
    expect(missed.every((i) => i.unread === undefined)).toBe(true);
  });

  it("an expired pending challenge is listed nowhere, even long after it was read", () => {
    const expired = pending("gone", 3 * 60 * MIN, { expiresAt: new Date(NOW - MIN).toISOString() });
    const { feed, missed } = buildBellLists([], [], [expired], NOW);
    expect([...feed, ...missed]).toEqual([]);
  });

  it("a pending challenge never appears twice", () => {
    const { feed, missed } = buildBellLists(history, [], [pending("old", 2 * 60 * MIN)], NOW);
    const ids = [...feed, ...missed].map((i) => i.id);
    expect(ids.filter((id) => id === "challenge-recv-old")).toHaveLength(1);
  });
});

describe("bellItemRoute", () => {
  const base = { title: "t", body: "b", createdAt: new Date(NOW).toISOString() };

  it.each(["challenge_received", "challenge_accepted", "challenge_declined"] as const)(
    "%s rows open the Arena",
    (type) => {
      expect(bellItemRoute({ ...base, id: "c", type, challengeId: "c" })).toBe("/arena");
    },
  );

  it("a fresh incoming challenge opens the Arena on that challenge (AC-A8)", () => {
    expect(
      bellItemRoute({ ...base, id: "c", type: "challenge_received", challengeId: "c1", unread: true }),
    ).toBe("/arena?challenge=c1");
    // Fresh with no id: plain Arena.
    expect(bellItemRoute({ ...base, id: "c", type: "challenge_received", unread: true })).toBe(
      "/arena",
    );
    // Answered rows never deep-link, even if marked unread.
    expect(
      bellItemRoute({ ...base, id: "c", type: "challenge_accepted", challengeId: "c1", unread: true }),
    ).toBe("/arena");
  });

  it("match results open match detail, never /session", () => {
    expect(bellItemRoute({ ...base, id: "match-m1", type: "match_result", matchId: "m1" })).toBe(
      "/(app)/match-detail/m1",
    );
    // Runtime guard for untyped rows (for example an old cached payload) that
    // still carry the retired /session route: with no match id the row is not
    // tappable, and the stray route is never used.
    const legacy = { ...base, id: "match-m2", type: "match_result" as const, route: "/session/m2" };
    expect(bellItemRoute(legacy)).toBeNull();
  });

  it("reels open their own route; session rows are not tappable", () => {
    expect(
      bellItemRoute({ ...base, id: "h", type: "highlight_ready", route: "/highlight/h1?source=bell", unread: false }),
    ).toBe("/highlight/h1?source=bell");
    expect(bellItemRoute({ ...base, id: "s", type: "session_joined" })).toBeNull();
  });
});

describe("Q3 dismissal (a challenge the Arena dropped on this device)", () => {
  it("lists a dismissed fresh challenge as Missed, uncounted, with a plain /arena route", () => {
    const list = [pending("keep", 1 * MIN), pending("gone", 2 * MIN)];
    const dismissed = (id: string) => id === "gone";
    const { fresh, missed } = splitPendingByFreshness(list, NOW, dismissed);
    expect(fresh.map((c) => c.id)).toEqual(["keep"]);
    expect(missed.map((c) => c.id)).toEqual(["gone"]);

    const lists = buildBellLists([], [], list, NOW, dismissed);
    const row = lists.missed.find((i) => i.id === "challenge-recv-gone");
    expect(row).toBeDefined();
    expect((row as { unread?: boolean }).unread).toBeUndefined();
    expect(bellItemRoute(row!)).toBe("/arena");
    expect(lists.feed.some((i) => i.id === "challenge-recv-gone")).toBe(false);
  });
});

describe("server clock offset (the bell, the tab badge and the Arena lapse together)", () => {
  it("a slow device clock lapses a challenge when the Arena does, not the skew later", () => {
    // Device clock 2 minutes behind the server: device - server = -2 min.
    noteServerTime(new Date(NOW + 2 * MIN).toISOString(), NOW);
    // 9 min old by the server's clock at device NOW (fresh); 11 min old two
    // device minutes later, so stale then, although the raw device clock
    // would still call it 9 min old.
    const c = pending("a", 7 * MIN);
    expect(isFreshPendingChallenge(c, NOW)).toBe(true);
    expect(isFreshPendingChallenge(c, NOW + 2 * MIN)).toBe(false);
    // And the boundary timer fires in DEVICE time, shifted by the offset.
    const at = nextFreshnessChangeAt([c], NOW);
    expect(at).toBe(Date.parse(c.createdAt) + ARENA_CHALLENGE_FRESH_MS - 2 * MIN);
  });

  it("a fast device clock does not drop a challenge early", () => {
    // Device clock 2 minutes ahead: device - server = +2 min.
    noteServerTime(new Date(NOW - 2 * MIN).toISOString(), NOW);
    const c = pending("a", ARENA_CHALLENGE_FRESH_MS + MIN);
    // 11 min old by the device clock, 9 by the server's: still fresh.
    expect(isFreshPendingChallenge(c, NOW)).toBe(true);
    expect(splitPendingByFreshness([c], NOW).fresh).toHaveLength(1);
  });
});
