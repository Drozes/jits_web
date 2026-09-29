/**
 * The rules for the set of incoming challenges the Arena counts (F9): what
 * is still a live challenge, what a pending read adds or removes, and what
 * the chip's "! 3 WANT TO ROLL" counts.
 */
import {
  __resetServerClockForTests,
  countWaitingIncoming,
  getServerClockOffsetMs,
  noteServerTime,
  freshDeadline,
  freshRemainingMs,
  isFreshIncoming,
  mergeIncomingRead,
  nextDeadline,
  pruneLapsed,
  type KnownIncoming,
} from "@/lib/arena/incoming-challenges";

const NOW = Date.parse("2026-09-28T12:00:00Z");
const FRESH_MS = 10 * 60_000;
const iso = (ms: number) => new Date(ms).toISOString();

function known(id: string, challengerId: string, over: Partial<KnownIncoming> = {}): KnownIncoming {
  return {
    challengeId: id,
    challengerId,
    createdAt: iso(NOW - 60_000),
    expiresAt: iso(NOW + 7 * 86_400_000),
    seenAt: NOW - 60_000,
    ...over,
  };
}

function mapOf(...items: KnownIncoming[]) {
  return new Map(items.map((c) => [c.challengeId, c]));
}

beforeEach(() => {
  __resetServerClockForTests();
});

describe("server clock offset", () => {
  it("shifts deadlines onto the device clock by the learned offset", () => {
    // This device runs 15 minutes ahead of the server (my own createChallenge
    // round trip says so).
    const skew = 15 * 60_000;
    noteServerTime(iso(NOW - skew), NOW, "roundtrip");
    expect(getServerClockOffsetMs()).toBe(skew);
    const c = { createdAt: iso(NOW - skew), expiresAt: iso(NOW + 86_400_000) };
    expect(freshDeadline(c)).toBe(NOW + FRESH_MS);
    expect(isFreshIncoming(c, NOW + FRESH_MS - 1)).toBe(true);
  });

  it("keeps the smallest recent sample and ignores unusable timestamps", () => {
    noteServerTime(iso(NOW - 5_000), NOW);
    noteServerTime(iso(NOW + 2_000), NOW);
    expect(getServerClockOffsetMs()).toBe(-2_000);
    // A later, slower delivery does not raise it.
    noteServerTime(iso(NOW + 1_000 - 4_000), NOW + 1_000);
    expect(getServerClockOffsetMs()).toBe(-2_000);
    noteServerTime(null, NOW);
    noteServerTime("nope", NOW);
    expect(getServerClockOffsetMs()).toBe(-2_000);
  });

  it("a late delivery does not extend a live window by its lateness", () => {
    // Calibrated earlier in the session (the window has since emptied).
    noteServerTime(iso(NOW - 20 * 60_000 - 500), NOW - 20 * 60_000);
    expect(getServerClockOffsetMs()).toBe(500);
    // A prompt learned from a read, created 60s ago.
    const c = { createdAt: iso(NOW - 60_000), expiresAt: iso(NOW + 86_400_000) };
    const before = freshDeadline(c);
    // An INSERT flushed four minutes late (resume from suspension).
    noteServerTime(iso(NOW - 240_000), NOW);
    expect(getServerClockOffsetMs()).toBe(500);
    expect(freshDeadline(c)).toBe(before);
    expect(isFreshIncoming(c, NOW - 60_000 + FRESH_MS + 500)).toBe(false);
  });

  it("a late delivery cannot raise an estimate a prompter sample set", () => {
    noteServerTime(iso(NOW - 800), NOW);
    expect(getServerClockOffsetMs()).toBe(800);
    noteServerTime(iso(NOW + 5_000 - 240_000), NOW + 5_000);
    noteServerTime(iso(NOW + 6_000 - 200_000), NOW + 6_000);
    // Two late ones agree with each other, but a plausible one is in the
    // window: the minimum stands.
    expect(getServerClockOffsetMs()).toBe(800);
  });

  it("takes the session's first sample as it comes (a phone that really is fast)", () => {
    const skew = 15 * 60_000;
    noteServerTime(iso(NOW - skew), NOW);
    expect(getServerClockOffsetMs()).toBe(skew);
  });

  it("follows a clock moved forwards once a second sample confirms it", () => {
    noteServerTime(iso(NOW), NOW);
    const later = NOW + 11 * 60_000;
    const skew = 15 * 60_000;
    noteServerTime(iso(later - skew), later);
    expect(getServerClockOffsetMs()).toBe(0);
    noteServerTime(iso(later + 1_000 - skew - 300), later + 1_000);
    expect(getServerClockOffsetMs()).toBe(skew);
  });

  it("always takes a roundtrip sample", () => {
    noteServerTime(iso(NOW), NOW);
    const later = NOW + 11 * 60_000;
    noteServerTime(iso(later - 120_000), later, "roundtrip");
    expect(getServerClockOffsetMs()).toBe(120_000);
  });

  it("follows a clock corrected backwards at once, and forwards once old samples age out", () => {
    noteServerTime(iso(NOW), NOW);
    noteServerTime(iso(NOW + 1_000 + 60_000), NOW + 1_000);
    expect(getServerClockOffsetMs()).toBe(-60_000);
    // Corrected forwards by two minutes, after the old samples aged out: a
    // lone sample is held back, a second confirms it.
    const later = NOW + 11 * 60_000;
    noteServerTime(iso(later - 120_000), later);
    noteServerTime(iso(later + 1_000 - 120_000), later + 1_000);
    expect(getServerClockOffsetMs()).toBe(120_000);
  });
});

describe("freshness", () => {
  it("runs 10 minutes from created_at", () => {
    const c = { createdAt: iso(NOW), expiresAt: iso(NOW + 86_400_000) };
    expect(freshDeadline(c)).toBe(NOW + FRESH_MS);
    expect(isFreshIncoming(c, NOW + FRESH_MS - 1)).toBe(true);
    expect(isFreshIncoming(c, NOW + FRESH_MS)).toBe(false);
    expect(freshRemainingMs(c, NOW + 60_000)).toBe(FRESH_MS - 60_000);
    expect(freshRemainingMs(c, NOW + FRESH_MS + 5)).toBe(0);
  });

  it("ends at expires_at when that is sooner", () => {
    const c = { createdAt: iso(NOW), expiresAt: iso(NOW + 1_000) };
    expect(freshDeadline(c)).toBe(NOW + 1_000);
  });

  it("falls back to expires_at, and to never, when timestamps are missing or bad", () => {
    expect(freshDeadline({ createdAt: null, expiresAt: iso(NOW + 5) })).toBe(NOW + 5);
    expect(freshDeadline({ createdAt: "nope", expiresAt: null })).toBeNull();
    expect(isFreshIncoming({ createdAt: null, expiresAt: null }, NOW)).toBe(true);
    expect(freshRemainingMs({ createdAt: null, expiresAt: null }, NOW)).toBeNull();
  });
});

describe("pruneLapsed / nextDeadline", () => {
  it("drops lapsed entries and keeps the same map when nothing lapsed", () => {
    const fresh = known("a", "x");
    const old = known("b", "y", { createdAt: iso(NOW - FRESH_MS - 1) });
    const m = mapOf(fresh, old);
    const pruned = pruneLapsed(m, NOW);
    expect([...pruned.keys()]).toEqual(["a"]);
    expect(pruneLapsed(pruned, NOW)).toBe(pruned);
  });

  it("reports the earliest deadline", () => {
    const m = mapOf(known("a", "x"), known("b", "y", { createdAt: iso(NOW - 300_000) }));
    expect(nextDeadline(m)).toBe(NOW - 300_000 + FRESH_MS);
    expect(nextDeadline(new Map())).toBeNull();
  });
});

describe("mergeIncomingRead", () => {
  const readRow = (id: string, challengerId: string) => ({
    challengeId: id,
    challengerId,
    createdAt: iso(NOW - 30_000),
    expiresAt: iso(NOW + 86_400_000),
  });

  it("adds what the read found, except settled ones", () => {
    const next = mergeIncomingRead(
      new Map(),
      [readRow("a", "x"), readRow("b", "y")],
      NOW,
      (id) => id === "b",
    );
    expect([...next.keys()]).toEqual(["a"]);
    expect(next.get("a")?.seenAt).toBe(NOW);
  });

  it("drops a known one the read no longer returns, but keeps one learned during the read", () => {
    const before = known("gone", "x", { seenAt: NOW - 10 });
    const during = known("new", "y", { seenAt: NOW + 5 });
    const next = mergeIncomingRead(mapOf(before, during), [], NOW, () => false);
    expect([...next.keys()]).toEqual(["new"]);
  });

  it("never drops the prompt's own challenge", () => {
    const surfaced = known("up", "x", { seenAt: NOW - 10 });
    const next = mergeIncomingRead(mapOf(surfaced), [], NOW, () => false, new Set(["up"]));
    expect(next.has("up")).toBe(true);
  });

  it("returns the same map when nothing changed", () => {
    const a = known("a", "x");
    const m = mapOf(a);
    expect(mergeIncomingRead(m, [readRow("a", "x")], NOW, () => false)).toBe(m);
  });
});

describe("countWaitingIncoming", () => {
  it("counts the prompt plus queued challengers on the mat, fresh only", () => {
    const m = mapOf(
      known("up", "gone-away"),
      known("b", "here"),
      known("c", "left"),
      known("d", "here2", { createdAt: iso(NOW - FRESH_MS - 1) }),
    );
    const lobby = new Set(["here", "here2"]);
    expect(countWaitingIncoming(m, "up", lobby, NOW)).toBe(2);
    expect(countWaitingIncoming(m, null, lobby, NOW)).toBe(1);
  });

  it("counts every fresh one when presence is unknown", () => {
    const m = mapOf(known("a", "x"), known("b", "y"));
    expect(countWaitingIncoming(m, null, null, NOW)).toBe(2);
  });
});
