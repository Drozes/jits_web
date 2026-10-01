/**
 * The Mat Board's rules (spec arena-live-chip section 6 and 7): countdowns,
 * closest-first order, which strip shows, whether the
 * Closest Match CTA is the surface's one red, the control bar counts, and the
 * Arena tab badge.
 */
import {
  arenaTabBadge,
  chooseStrip,
  closestCta,
  countOnTheMat,
  formatMatCounts,
  isOnTheMat,
  matCounts,
  onTheMatRows,
  pickClosest,
  sortByEloGap,
} from "@/lib/arena/mat-board";

describe("sortByEloGap / pickClosest (AC-A3, AC-A4)", () => {
  const a = (id: string, eloDiff: number) => ({ id, eloDiff });

  it("sorts by |ΔELO| ascending, stable for ties, without mutating", () => {
    const list = [a("far", 300), a("tieA", -40), a("near", 5), a("tieB", 40)];
    const sorted = sortByEloGap(list);
    expect(sorted.map((c) => c.id)).toEqual(["near", "tieA", "tieB", "far"]);
    expect(list.map((c) => c.id)).toEqual(["far", "tieA", "near", "tieB"]);
  });

  it("picks the closest athlete (every match is ranked), or nobody", () => {
    expect(pickClosest([a("x", 0), a("y", 10)])?.id).toBe("x");
    expect(pickClosest([])).toBeNull();
  });

  it("skips anyone the exclude names (a challenge already pending with them)", () => {
    const list = [a("x", 0), a("y", 10), a("z", 20)];
    expect(pickClosest(list, (c) => c.id === "x")?.id).toBe("y");
    expect(pickClosest(list, (c) => c.id !== "z")?.id).toBe("z");
    expect(pickClosest(list, () => true)).toBeNull();
  });
});

describe("chooseStrip (AC-A2)", () => {
  const none = { hasIncoming: false, hasOutgoing: false, hasOffer: false, hasConfirm: false };
  it("is absent when nothing applies", () => {
    expect(chooseStrip(none)).toEqual({ challenge: null, alsoWaiting: false, confirm: false });
  });
  it("ranks the one challenge strip: incoming, then the push offer, then waiting", () => {
    expect(chooseStrip({ ...none, hasIncoming: true, hasOutgoing: true, hasOffer: true }).challenge).toBe("incoming");
    expect(chooseStrip({ ...none, hasOffer: true }).challenge).toBe("offer");
    expect(chooseStrip({ ...none, hasOutgoing: true }).challenge).toBe("waiting");
  });
  it("an offer leads over my own waiting challenge, which stays under it (spec 14)", () => {
    // Offline with an unanswered outgoing challenge: the offer a push or the
    // tab's red count points at must show; Cancel challenge stays reachable.
    expect(chooseStrip({ ...none, hasOutgoing: true, hasOffer: true })).toEqual({
      challenge: "offer",
      alsoWaiting: true,
      confirm: false,
    });
    expect(
      chooseStrip({ ...none, hasOutgoing: true, hasOffer: true, hasConfirm: true }),
    ).toEqual({ challenge: "offer", alsoWaiting: true, confirm: true });
  });
  it("a push offer outranks an incoming prompt tucked away with Later (AC-A8)", () => {
    expect(
      chooseStrip({ ...none, hasIncoming: true, incomingTucked: true, hasOffer: true }).challenge,
    ).toBe("offer");
    // Tucked with no offer, or an offer under a prompt that is up: incoming.
    expect(chooseStrip({ ...none, hasIncoming: true, incomingTucked: true }).challenge).toBe(
      "incoming",
    );
    expect(
      chooseStrip({ ...none, hasIncoming: true, incomingTucked: false, hasOffer: true }).challenge,
    ).toBe("incoming");
  });
  it("never lets a challenge strip displace a result to confirm", () => {
    expect(chooseStrip({ hasIncoming: true, hasOutgoing: true, hasOffer: true, hasConfirm: true })).toEqual({
      challenge: "incoming",
      alsoWaiting: false,
      confirm: true,
    });
    expect(chooseStrip({ ...none, hasOutgoing: true, hasConfirm: true })).toEqual({
      challenge: "waiting",
      alsoWaiting: false,
      confirm: true,
    });
    expect(chooseStrip({ ...none, hasConfirm: true })).toEqual({
      challenge: null,
      alsoWaiting: false,
      confirm: true,
    });
  });
  it("keeps my outgoing challenge reachable under a tucked incoming (or an offer over it)", () => {
    // Tucked incoming leads; my waiting strip (Cancel challenge) still shows.
    expect(
      chooseStrip({ ...none, hasIncoming: true, incomingTucked: true, hasOutgoing: true }),
    ).toEqual({ challenge: "incoming", alsoWaiting: true, confirm: false });
    expect(
      chooseStrip({
        ...none,
        hasIncoming: true,
        incomingTucked: true,
        hasOutgoing: true,
        hasOffer: true,
      }),
    ).toEqual({ challenge: "offer", alsoWaiting: true, confirm: false });
    // The prompt is up (the sheet covers the screen): no second strip.
    expect(
      chooseStrip({ ...none, hasIncoming: true, incomingTucked: false, hasOutgoing: true })
        .alsoWaiting,
    ).toBe(false);
    // Waiting already leads: never twice.
    expect(chooseStrip({ ...none, hasOutgoing: true }).alsoWaiting).toBe(false);
  });
});

describe("closestCta (AC-A3: one red CTA)", () => {
  const idle = { isLive: true, hasClosest: true, hasIncoming: false, hasOutgoing: false, hasOffer: false };
  it("live: a red CHALLENGE", () => {
    expect(closestCta(idle)).toEqual({ kind: "challenge", red: true });
  });
  it("offline: a red GO LIVE TO ROLL", () => {
    expect(closestCta({ ...idle, isLive: false })).toEqual({ kind: "go-live", red: true });
  });
  it("demotes to outline whenever something else owns red", () => {
    expect(closestCta({ ...idle, hasIncoming: true }).red).toBe(false);
    expect(closestCta({ ...idle, hasOutgoing: true }).red).toBe(false);
    expect(closestCta({ ...idle, isLive: false, hasOffer: true }).red).toBe(false);
  });
  it("live on an empty mat: no CTA at all", () => {
    expect(closestCta({ ...idle, hasClosest: false })).toEqual({ kind: "none", red: false });
  });
  it("offline on an empty mat (or one of only pending athletes): still a red GO LIVE TO ROLL", () => {
    expect(closestCta({ ...idle, isLive: false, hasClosest: false })).toEqual({
      kind: "go-live",
      red: true,
    });
    expect(closestCta({ ...idle, isLive: false, hasClosest: false, hasOffer: true })).toEqual({
      kind: "go-live",
      red: false,
    });
  });
  it("at the 3-challenge cap the disabled CHALLENGE is never the red one", () => {
    expect(closestCta({ ...idle, capped: true })).toEqual({ kind: "challenge", red: false });
    // The cap does not touch going live.
    expect(closestCta({ ...idle, isLive: false, capped: true }).red).toBe(true);
  });
});

describe("formatMatCounts (AC-A1)", () => {
  it("reads N ON MAT · M IN BAND", () => {
    expect(formatMatCounts(12, 7)).toBe("12 ON MAT · 7 IN BAND");
  });
  it("nobody else on the mat reads no number and claims nobody (D2)", () => {
    expect(formatMatCounts(0, 0)).toBe("NOBODY ELSE ON MAT");
  });
  it("never states a count it does not know", () => {
    expect(formatMatCounts(null, null)).toBe("CONNECTING");
    // One count known and the other not: never a false `0 IN BAND`.
    expect(formatMatCounts(12, null)).toBe("CONNECTING");
    expect(formatMatCounts(null, 3)).toBe("CONNECTING");
  });
});

describe("On The Mat rows and the counts derived from them (spec 14, D2)", () => {
  const roster = [
    { id: "a", eloDiff: 150 },
    { id: "b", eloDiff: -100 },
    { id: "c", eloDiff: 100 },
    { id: "d", eloDiff: 101 },
    { id: "me", eloDiff: 0 },
  ];

  it("rows are roster athletes in the lobby, self excluded, closest first", () => {
    const lobby = new Set(["me", "a", "b", "c", "ghost"]);
    expect(onTheMatRows(roster, lobby, "me").map((r) => r.id)).toEqual(["b", "c", "a"]);
    expect(isOnTheMat("me", lobby, "me")).toBe(false);
    expect(isOnTheMat("ghost", lobby, "me")).toBe(true);
  });

  it("matCounts: ON MAT is the row count, IN BAND the rows within 100 of the displayed gap", () => {
    const rows = onTheMatRows(roster, new Set(["a", "b", "c", "d"]), "me");
    expect(matCounts(rows, true)).toEqual({ onMat: 4, inBand: 2 });
    expect(matCounts(rows, false)).toEqual({ onMat: 4, inBand: null });
    expect(matCounts([], true)).toEqual({ onMat: 0, inBand: 0 });
    expect(matCounts(null, true)).toEqual({ onMat: null, inBand: null });
  });

  it("countOnTheMat is null without a roster, whatever the lobby holds", () => {
    expect(countOnTheMat(null, new Set(["a", "b"]), "me")).toBeNull();
    expect(countOnTheMat([], new Set(["a", "b"]), "me")).toBe(0);
  });

  it("INVARIANT: the chip's count, the bar's counts and the rows never disagree", () => {
    // Deterministic pseudo-random cases: stray presence keys, self in the
    // lobby and on the roster, duplicates in the lobby set's source list.
    let seed = 7;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const ids = ["me", "a", "b", "c", "d", "e", "f", "ghost-1", "ghost-2"];
    for (let i = 0; i < 300; i++) {
      const rosterSample = ids
        .filter((id) => !id.startsWith("ghost") && rand() < 0.6)
        .map((id) => ({ id, eloDiff: Math.round(rand() * 400 - 200) }));
      const lobby = new Set(ids.filter(() => rand() < 0.5));
      const rows = onTheMatRows(rosterSample, lobby, "me");
      const chip = countOnTheMat(
        rosterSample.map((r) => r.id),
        lobby,
        "me",
      );
      const bar = matCounts(rows, true);
      expect(chip).toBe(rows.length);
      expect(bar.onMat).toBe(rows.length);
      expect(bar.inBand).toBe(rows.filter((r) => Math.abs(r.eloDiff) <= 100).length);
      for (const r of rows) {
        expect(r.id).not.toBe("me");
        expect(r.id.startsWith("ghost")).toBe(false);
      }
    }
  });
});

describe("arenaTabBadge (AC-T1..4)", () => {
  it("AC-T1: fresh incoming challenges show a red count", () => {
    expect(arenaTabBadge({ incomingCount: 2, isLive: true, hasConfirm: false })).toEqual({
      kind: "count",
      count: 2,
      label: "2 challenges",
    });
    expect(arenaTabBadge({ incomingCount: 1, isLive: false, hasConfirm: true })).toEqual({
      kind: "count",
      count: 1,
      label: "1 challenge",
    });
  });
  it("AC-T2: live shows a static green dot, including live plus a result to confirm", () => {
    expect(arenaTabBadge({ incomingCount: 0, isLive: true, hasConfirm: false })).toEqual({ kind: "dot", label: "Live" });
    expect(arenaTabBadge({ incomingCount: 0, isLive: true, hasConfirm: true })).toEqual({
      kind: "dot",
      label: "Live, result to confirm",
    });
  });
  it("AC-T3: offline plus a result to confirm shows a hollow ring", () => {
    expect(arenaTabBadge({ incomingCount: 0, isLive: false, hasConfirm: true })).toEqual({
      kind: "ring",
      label: "Result to confirm",
    });
  });
  it("AC-T4: offline and idle shows nothing", () => {
    expect(arenaTabBadge({ incomingCount: 0, isLive: false, hasConfirm: false })).toBeNull();
    expect(arenaTabBadge({ incomingCount: Number.NaN, isLive: false, hasConfirm: false })).toBeNull();
  });
});
