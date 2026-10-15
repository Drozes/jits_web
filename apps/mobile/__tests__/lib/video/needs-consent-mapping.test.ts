/**
 * A clip waiting for AI processing consent (`needs_consent`, jits-rog5.11)
 * on every derived surface: its own "Needs your OK" label in the attention
 * (waiting) tone, Try again everywhere, Discard on the upload card, and the
 * screen-reader line.
 */
import type { MatchUploadEntry } from "@/lib/video/match-upload-store";
import { deriveCompactLine, deriveUploadStrip } from "@/lib/video/upload-strip";
import { deriveUploadBannerState, uploadBannerActions, uploadBannerTone } from "@/lib/video/upload-banner-state";
import { uploadAnnouncement } from "@/lib/video/use-upload-announcements";
import { angleStatus, localAngleJob } from "@/lib/video/angle-status";
import { cardOffersRetry, deriveCardStatus, statusBadgeLabel } from "@/lib/film-room/card-status";
import { COMPACT_COPY } from "@/lib/video/video-status-copy";

const ENTRY = {
  matchId: "M1",
  status: "paused",
  errorClass: "needs_consent",
  error: "Allow AI processing to upload this clip.",
  progress: 0.3,
  truncation: null,
  bytesTotal: 100,
  storagePath: "M1/A1/1.mp4",
  videoId: null,
} as unknown as MatchUploadEntry;

it("strip: Needs your OK, attention tone, Try again", () => {
  expect(deriveUploadStrip([ENTRY], null, [])).toMatchObject({
    kind: "paused",
    label: "Needs your OK",
    helper: "Allow AI processing to upload this clip.",
    tone: "waiting",
    retry: true,
    a11y: "Your match video needs your OK to upload. Opens the match.",
  });
});

it("compact line: Your angle: needs your OK, Try again", () => {
  expect(deriveCompactLine(ENTRY, COMPACT_COPY)).toMatchObject({ kind: "needsOk", text: "Your angle: needs your OK", tone: "waiting", retry: true });
});

it("upload card: Try again and Discard, attention tone, and the announcement", () => {
  const state = deriveUploadBannerState("idle", null, ENTRY);
  expect(state).toMatchObject({ kind: "paused", errorClass: "needs_consent" });
  expect(uploadBannerActions(state)).toEqual({ retry: true, discard: true });
  expect(uploadBannerTone(state)).toBe("waiting");
  expect(uploadAnnouncement(state)).toBe("Needs your OK. Allow AI processing to upload this clip.");
});

it("an ordinary pause still offers no Discard", () => {
  const state = deriveUploadBannerState("idle", null, { ...ENTRY, errorClass: "offline" } as MatchUploadEntry);
  expect(uploadBannerActions(state)).toEqual({ retry: true, discard: false });
});

it("Film row source: the local job carries needsConsent, the angle tag says Needs your OK", () => {
  const job = localAngleJob(ENTRY);
  expect(job).toMatchObject({ status: "paused", needsConsent: true });
  const v = { id: "v", is_mine: true, status: "uploading", playability: "processing" } as never;
  expect(angleStatus(v, { name: "Me", local: job })).toMatchObject({ tag: "Needs your OK", tone: "waiting" });
});

it("Film card: NEEDS YOUR OK badge and its own Try again", () => {
  const status = deriveCardStatus({ videos: [] } as never, ENTRY, true);
  expect(status).toMatchObject({ kind: "paused", needsConsent: true });
  expect(statusBadgeLabel(status)).toBe("NEEDS YOUR OK");
  expect(cardOffersRetry(status)).toBe(true);
});
