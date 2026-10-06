import type { MatchLibraryItem } from "@jits/shared/api/film-room";
import { deriveCardStatus, statusBadgeLabel, type CardPhase } from "@/lib/film-room/card-status";
import { toneFor } from "@/components/film-room/status-badge";
import { cardPhaseOf, recentMatchIds } from "@/lib/film-room/use-film-room-phases";
import type { MatchUploadEntry } from "@/lib/video/match-upload-store";
import { angle, iso, NOW, statusFixture } from "../../support/match-video-status-fixture";

jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));

const NOW_MS = Date.parse("2026-10-05T20:30:00Z");

function item(over: Partial<MatchLibraryItem> = {}): MatchLibraryItem {
  return {
    match_id: "m1",
    completed_at: new Date(NOW_MS - 3600_000).toISOString(),
    videos: [],
    ...over,
  } as unknown as MatchLibraryItem;
}

const phase = (p: Partial<CardPhase>): CardPhase => ({ phase: "collecting", reason: "awaiting_first_angle", waitRemainingMs: null, ...p });
const upload = (over: Partial<MatchUploadEntry>): MatchUploadEntry =>
  ({ matchId: "m1", status: "uploading", progress: 0.4, error: null, errorClass: null, videoId: null, bytesTotal: null, truncation: null, storagePath: null, updatedAt: 1, ...over }) as MatchUploadEntry;

describe("Film Room badge priority with the server phase (deck section 9)", () => {
  it("the local job outranks every server phase", () => {
    const waiting = phase({ phase: "waiting_for_angle", waitRemainingMs: 60_000 });
    expect(deriveCardStatus(item(), upload({ status: "error", errorClass: "offline" }), true, NOW_MS, waiting).kind).toBe("upload_failed");
    expect(deriveCardStatus(item(), upload({ status: "paused" }), true, NOW_MS, waiting).kind).toBe("paused");
    expect(deriveCardStatus(item(), upload({ status: "uploading" }), true, NOW_MS, waiting).kind).toBe("uploading");
  });

  it.each([
    ["waiting", phase({ phase: "waiting_for_angle", waitRemainingMs: 492_000 }), "WAITING 8:12", "8:12", "amber"],
    ["waiting past the deadline", phase({ phase: "waiting_for_angle", waitRemainingMs: -1 }), "WAITING", "WAITING", "amber"],
    ["building", phase({ phase: "building", reason: null }), "BUILDING HIGHLIGHT", "BUILDING", "amber"],
    ["collecting", phase({}), "UPLOADING", "UPLOADING", "amber"],
    ["no film", phase({ phase: "no_film", reason: "none_usable" }), "NO FILM", "NO FILM", "muted"],
  ] as const)("%s", (_n, ph, badge, _compact, tone) => {
    const s = deriveCardStatus(item(), null, true, NOW_MS, ph);
    expect(statusBadgeLabel(s)).toBe(badge);
    expect(toneFor(s)).toBe(tone);
  });

  it("pre-grace 'No video yet' has no badge (never 'No film' early)", () => {
    expect(deriveCardStatus(item(), null, true, NOW_MS, phase({ reason: "no_video_yet" })).kind).toBe("none");
  });

  it("ready: New (unseen, fresh, film) > Breakdown ready > none", () => {
    const videos = [{ id: "v", status: "analyzed", has_analysis: true, playability: "playable" }] as never;
    const ready = phase({ phase: "ready", reason: null });
    expect(deriveCardStatus(item({ videos }), null, false, NOW_MS, ready).kind).toBe("new");
    expect(deriveCardStatus(item({ videos }), null, true, NOW_MS, ready).kind).toBe("ready");
    expect(deriveCardStatus(item({ videos: [{ id: "v", has_analysis: false }] as never }), null, true, NOW_MS, ready).kind).toBe("none");
  });

  it("Processing is never a card badge", () => {
    const videos = [{ id: "v", status: "slicing", has_analysis: false, playability: "playable", chunk_count: null, chunks_completed: 0 }] as never;
    // Without a phase the library derivation stays; with one, the phase decides.
    const s = deriveCardStatus(item({ videos }), null, true, NOW_MS, phase({ phase: "building", reason: null }));
    expect(statusBadgeLabel(s)).toBe("BUILDING HIGHLIGHT");
  });
});

describe("useFilmRoomPhases helpers", () => {
  it("reads only the newest matches of the last 48 h, capped", () => {
    const items = Array.from({ length: 9 }, (_, i) => ({ match_id: `m${i}`, completed_at: new Date(NOW_MS - i * 3600_000).toISOString() }));
    items.push({ match_id: "old", completed_at: new Date(NOW_MS - 50 * 3600_000).toISOString() });
    expect(recentMatchIds(items, NOW_MS)).toEqual(["m0", "m1", "m2", "m3", "m4", "m5"]);
  });

  it("counts the wait by the server's clock (skewed device)", () => {
    const s = statusFixture({ phase: "waiting_for_angle", phase_reason: null, wait_deadline_at: iso(NOW + 120_000), angles: [angle("me", "ready"), angle("opp", "uploading")] });
    // Device 30 s behind the server: offset +30 s; device now = NOW - 30 s.
    expect(cardPhaseOf(s, 30_000, NOW - 30_000).waitRemainingMs).toBe(120_000);
  });
});

describe("review M1 and M2 on the card", () => {
  const videos = [{ id: "v", status: "analyzed", has_analysis: true, playability: "playable" }] as never;

  it("own reel final while the match builds: the card follows the viewer (New / Breakdown ready), not BUILDING", () => {
    const ph = phase({ phase: "building", reason: null, ownReel: "ready" });
    expect(deriveCardStatus(item({ videos }), null, false, NOW_MS, ph).kind).toBe("new");
    expect(deriveCardStatus(item({ videos }), null, true, NOW_MS, ph).kind).toBe("ready");
    expect(deriveCardStatus(item({ videos: [{ id: "v", has_analysis: false, status: "analyzed", playability: "playable" }] as never }), null, true, NOW_MS, phase({ phase: "building", reason: null, ownReel: "none" })).kind).toBe("none");
    // Own reel still building: BUILDING.
    expect(statusBadgeLabel(deriveCardStatus(item({ videos }), null, true, NOW_MS, phase({ phase: "building", reason: null, ownReel: "building" })))).toBe("BUILDING HIGHLIGHT");
  });

  it("collecting with bytes landed falls through to the shipped ANALYZING n/m", () => {
    const slicing = [{ id: "v", status: "analyzing", has_analysis: false, playability: "playable", chunk_count: 7, chunks_completed: 2 }] as never;
    expect(statusBadgeLabel(deriveCardStatus(item({ videos: slicing }), null, true, NOW_MS, phase({})))).toBe("ANALYZING 2/7");
    // Nothing landed (only a reservation uploading): UPLOADING.
    const reserving = [{ id: "v", status: "uploading", has_analysis: false, playability: "processing" }] as never;
    expect(statusBadgeLabel(deriveCardStatus(item({ videos: reserving }), null, true, NOW_MS, phase({})))).toBe("UPLOADING");
  });

  it("cardPhaseOf carries the viewer's own reel", () => {
    const s = statusFixture({ phase: "building", phase_reason: null, reels: [{ athlete_id: "me-x", state: "ready" }] });
    expect(cardPhaseOf(s, 0, NOW, "me-x").ownReel).toBe("ready");
    expect(cardPhaseOf(s, 0, NOW, null).ownReel).toBeNull();
  });
});
