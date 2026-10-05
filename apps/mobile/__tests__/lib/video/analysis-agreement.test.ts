/**
 * Review M2 (COPY-DECK v2.4): while this phone's clip has landed and the
 * film is analysing, no surface says "uploading". The strip has hidden, the
 * compact line says uploaded, the plate and the verdict say Analyzing (and
 * the CTA can play), and the Film Room card shows the shipped ANALYZING n/m.
 */
import type { MatchLibraryItem } from "@jits/shared/api/film-room";
import { deriveFilmStatus } from "@/lib/video/film-status";
import { deriveCompactLine, deriveUploadStrip } from "@/lib/video/upload-strip";
import { deriveCardStatus, statusBadgeLabel } from "@/lib/film-room/card-status";
import { cardPhaseOf } from "@/lib/film-room/use-film-room-phases";
import { COMPACT_COPY } from "@/lib/video/video-status-copy";
import type { MatchUploadEntry } from "@/lib/video/match-upload-store";
import { angle, ME, NOW, statusFixture, V_ME } from "../../support/match-video-status-fixture";

jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));

const UPLOADING = /upload(ing)?\b(?!ed)/i;

it("strip, compact line, plate, verdict and Film Room badge agree during analysis", () => {
  const status = statusFixture({ angles: [angle("me", "processing"), angle("opp", "not_recording")], angles_expected: 1 });
  const landed = { matchId: "m1", status: "uploaded", progress: 1, error: null, errorClass: null, videoId: V_ME, bytesTotal: null, truncation: null, storagePath: null, updatedAt: 1 } as MatchUploadEntry;

  // Strip: the job is no longer outstanding; after its 4 s flash it hides.
  expect(deriveUploadStrip([], null, [])).toBeNull();
  // Compact line.
  expect(deriveCompactLine(landed, COMPACT_COPY)?.text).toBe("Your angle: uploaded");
  // Plate and verdict Film block (one component, one view).
  const view = deriveFilmStatus({ status, viewerId: ME, local: null, nowMs: NOW, clockOffsetMs: 0, playable: new Map([[V_ME, 271]]) });
  expect(view.phaseTag).toBe("Analyzing");
  expect(view.line).toBe("Your film is in. Analyzing now.");
  expect(view.rows[0]).toMatchObject({ tag: "Analyzing", watchable: true });
  // Verdict CTA set.
  expect(view.playableVideoIds).toEqual([V_ME]);
  // Film Room card.
  const item = {
    match_id: "m1",
    completed_at: new Date(NOW - 600_000).toISOString(),
    videos: [{ id: V_ME, status: "analyzing", has_analysis: false, playability: "playable", chunk_count: 7, chunks_completed: 3 }],
  } as unknown as MatchLibraryItem;
  const badge = statusBadgeLabel(deriveCardStatus(item, null, true, NOW, cardPhaseOf(status, 0, NOW, ME)));
  expect(badge).toBe("ANALYZING 3/7");

  for (const said of [view.phaseTag, view.line, view.rows[0].tag, badge ?? ""]) expect(said).not.toMatch(UPLOADING);
});
