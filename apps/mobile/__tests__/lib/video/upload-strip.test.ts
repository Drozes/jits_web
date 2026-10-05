import { combinedPercent, deriveCompactLine, deriveUploadStrip } from "@/lib/video/upload-strip";
import type { MatchUploadEntry } from "@/lib/video/match-upload-store";
import { COMPACT_COPY } from "@/lib/video/video-status-copy";

function job(matchId: string, over: Partial<MatchUploadEntry> = {}): MatchUploadEntry {
  return {
    matchId,
    status: "uploading",
    videoId: null,
    error: null,
    errorClass: null,
    bytesTotal: null,
    truncation: null,
    storagePath: null,
    progress: 0.42,
    updatedAt: 1,
    ...over,
  };
}

describe("deriveUploadStrip (jits-n2im.2, deck section 3)", () => {
  it("uploading: label, percent, opens the match", () => {
    expect(deriveUploadStrip([job("m1")], null, [])).toMatchObject({
      kind: "uploading",
      matchId: "m1",
      label: "Uploading match video",
      percent: 42,
      retry: false,
      a11y: "Uploading match video, 42 percent. Opens the match.",
    });
  });

  it("two uploads: one line with the combined percent, opening the most recent", () => {
    const m = deriveUploadStrip([job("new", { progress: 0.8, bytesTotal: 100 }), job("old", { progress: 0.2, bytesTotal: 300 })], null, []);
    expect(m).toMatchObject({ kind: "uploading", matchId: "new", label: "Uploading 2 match videos", percent: 35 });
  });

  it("paused retries on its own, with its own Try again and the cause", () => {
    const m = deriveUploadStrip([job("m1", { status: "paused", error: "No connection right now. It picks up where it left off.", errorClass: "offline" })], null, []);
    expect(m).toMatchObject({ kind: "paused", label: "Upload paused", helper: "No connection right now. It picks up where it left off.", retry: true, tone: "waiting" });
  });

  it("failed: red with Try again; terminal: grey with Details, no Try again", () => {
    expect(deriveUploadStrip([job("m1", { status: "error", errorClass: "offline", error: null })], null, [])).toMatchObject({ kind: "failed", label: "Didn't upload", helper: "The upload didn't finish.", retry: true, tone: "negative" });
    expect(deriveUploadStrip([job("m1", { status: "error", errorClass: "file_missing", error: "The clip isn't on this phone anymore." })], null, [])).toMatchObject({
      kind: "terminal",
      retry: false,
      details: true,
      tone: "info",
    });
  });

  it("is hidden on the countdown and live (every job)", () => {
    expect(deriveUploadStrip([job("m1"), job("m2")], null, [{ kind: "all" }])).toBeNull();
  });

  it("is hidden for this match on its own verdict and match detail, but still shows another match's job", () => {
    expect(deriveUploadStrip([job("m1")], null, [{ kind: "match", matchId: "m1" }])).toBeNull();
    expect(deriveUploadStrip([job("m1"), job("m2", { status: "paused" })], null, [{ kind: "match", matchId: "m1" }])).toMatchObject({ kind: "paused", matchId: "m2" });
  });

  it("says 'Match video uploaded' briefly after a job lands, unless that match is on screen", () => {
    expect(deriveUploadStrip([], "m1", [])).toMatchObject({ kind: "uploaded", label: "Match video uploaded", matchId: "m1" });
    expect(deriveUploadStrip([], "m1", [{ kind: "match", matchId: "m1" }])).toBeNull();
    expect(deriveUploadStrip([], null, [])).toBeNull();
  });
});

describe("combinedPercent", () => {
  it("is byte-weighted when every size is known, else the mean, else null", () => {
    expect(combinedPercent([{ progress: 1, bytesTotal: 100 }, { progress: 0, bytesTotal: 300 }])).toBe(25);
    expect(combinedPercent([{ progress: 1, bytesTotal: null }, { progress: 0, bytesTotal: 300 }])).toBe(50);
    expect(combinedPercent([{ progress: null, bytesTotal: null }])).toBeNull();
  });
});

describe("deriveCompactLine (End, Result, Confirm)", () => {
  const e = (over: Partial<MatchUploadEntry>) => job("m1", over);
  it.each([
    ["pending", e({ status: "pending" }), { text: "Your angle: preparing upload", retry: false }],
    ["uploading", e({ status: "uploading", progress: 0.42 }), { text: "Your angle: uploading", percent: 42, retry: false }],
    ["paused", e({ status: "paused" }), { text: "Your angle: paused", retry: true, tone: "waiting" }],
    ["failed", e({ status: "error", errorClass: "server" }), { text: "Your angle: didn't upload", retry: true, tone: "negative" }],
    ["terminal", e({ status: "error", errorClass: "too_large" }), { text: "Your angle: didn't upload", retry: false, tone: "info" }],
    ["uploaded", e({ status: "uploaded" }), { text: "Your angle: uploaded", retry: false }],
  ] as const)("%s", (_n, entry, want) => {
    expect(deriveCompactLine(entry, COMPACT_COPY)).toMatchObject(want);
  });
  it("renders nothing without a recording", () => {
    expect(deriveCompactLine(null, COMPACT_COPY)).toBeNull();
  });
});
