import { deriveCardStatus, statusBadgeLabel, uploadingLabel, NEW_WINDOW_MS } from "@/lib/film-room/card-status";
import type { MatchUploadEntry } from "@/lib/video/match-upload-store";
import { libItem, libVideo } from "../../support/film-fixtures";

const NOW = Date.parse("2026-09-27T12:00:00Z");

function upload(over: Partial<MatchUploadEntry> = {}): MatchUploadEntry {
  return { matchId: "m-1", status: "uploading", videoId: null, error: null, truncation: null, storagePath: null, progress: 0.64, updatedAt: 0, ...over };
}

describe("deriveCardStatus", () => {
  it("reports this phone's upload with its real progress first", () => {
    expect(deriveCardStatus(libItem({ videos: [] }), upload(), true, NOW)).toEqual({ kind: "uploading", progress: 0.64 });
    expect(deriveCardStatus(libItem(), upload({ status: "pending", progress: null }), true, NOW)).toEqual({ kind: "uploading", progress: null });
    // A settled upload says nothing by itself.
    expect(deriveCardStatus(libItem(), upload({ status: "uploaded" }), true, NOW).kind).toBe("ready");
  });

  it("treats rows still uploading as uploading, all-failed as failed", () => {
    expect(deriveCardStatus(libItem({ videos: [libVideo({ status: "uploading", playability: "processing", has_analysis: false })] }), null, true, NOW)).toEqual({ kind: "uploading", progress: null });
    expect(deriveCardStatus(libItem({ videos: [libVideo({ status: "failed", playability: "failed", has_analysis: false })] }), null, true, NOW)).toEqual({ kind: "failed" });
  });

  it("counts analysis chunks while the pipeline runs", () => {
    const analyzing = libItem({ videos: [libVideo({ status: "analyzing", has_analysis: false, chunk_count: 7, chunks_completed: 3 })] });
    expect(deriveCardStatus(analyzing, null, true, NOW)).toEqual({ kind: "analyzing", done: 3, total: 7 });
    const slicing = libItem({ videos: [libVideo({ status: "slicing", has_analysis: false, chunk_count: null, chunks_completed: 0 })] });
    expect(deriveCardStatus(slicing, null, true, NOW)).toEqual({ kind: "analyzing", done: null, total: null });
    const sliced = libItem({ videos: [libVideo({ status: "ready", has_analysis: false, chunk_count: 4, chunks_completed: 1 })] });
    expect(deriveCardStatus(sliced, null, true, NOW)).toEqual({ kind: "analyzing", done: 1, total: 4 });
  });

  it("shows NEW for unseen playable film from the last week, then BREAKDOWN READY", () => {
    expect(deriveCardStatus(libItem(), null, false, NOW)).toEqual({ kind: "new" });
    expect(deriveCardStatus(libItem(), null, true, NOW)).toEqual({ kind: "ready" });
    const old = libItem({ completed_at: new Date(NOW - NEW_WINDOW_MS - 1000).toISOString() });
    expect(deriveCardStatus(old, null, false, NOW)).toEqual({ kind: "ready" });
  });

  it("has nothing to say about no film, or seen film without analysis", () => {
    expect(deriveCardStatus(libItem({ videos: [] }), null, false, NOW)).toEqual({ kind: "none" });
    const plain = libItem({ videos: [libVideo({ status: "ready", has_analysis: false, chunk_count: null })] });
    expect(deriveCardStatus(plain, null, true, NOW)).toEqual({ kind: "none" });
  });

  it("a breakdown on either angle beats the other angle still analyzing", () => {
    const two = libItem({ videos: [libVideo(), libVideo({ video_id: "v-2", status: "analyzing", has_analysis: false, chunk_count: 5, chunks_completed: 1 })] });
    expect(deriveCardStatus(two, null, true, NOW)).toEqual({ kind: "ready" });
  });
});

describe("labels", () => {
  it("names each badge", () => {
    expect(statusBadgeLabel({ kind: "analyzing", done: 3, total: 7 })).toBe("ANALYZING 3/7");
    expect(statusBadgeLabel({ kind: "analyzing", done: null, total: null })).toBe("ANALYZING");
    expect(statusBadgeLabel({ kind: "new" })).toBe("NEW");
    expect(statusBadgeLabel({ kind: "ready" })).toBe("BREAKDOWN READY");
    expect(statusBadgeLabel({ kind: "failed" })).toBe("FAILED");
    expect(statusBadgeLabel({ kind: "uploading", progress: 0.2 })).toBeNull();
    expect(statusBadgeLabel({ kind: "none" })).toBeNull();
  });

  it("rounds and clamps the upload percentage", () => {
    expect(uploadingLabel(0.644)).toBe("UPLOADING 64%");
    expect(uploadingLabel(1.3)).toBe("UPLOADING 100%");
    expect(uploadingLabel(null)).toBe("UPLOADING");
  });
});
