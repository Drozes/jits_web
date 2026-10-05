/**
 * jits-n2im.4, acceptance 2: every combination of this phone's upload and
 * the server's video rows, across every surface that can say "no film".
 *
 * Local: none, uploading, paused, failed, uploaded.
 * Server: no row, reserved (a row still at status 'uploading', which
 * jits-n2im.11 will create before the bytes), ready/processing, analyzed,
 * failed.
 *
 * The invariant: no surface ever says there is no video while a local job
 * or a server row exists. Plus the per-item contradictions the bead lists.
 */
import { deriveFilmSection } from "@/lib/match-detail/film-section";
import { deriveCardStatus, statusBadgeLabel } from "@/lib/film-room/card-status";
import { filmStillCaption, uploadingLabel, watchFilmBusyLabel } from "@/lib/video/upload-copy";
import { deriveUploadBannerState, uploadBannerActions } from "@/lib/video/upload-banner-state";
import type { MatchUploadEntry, MatchUploadStatus } from "@/lib/video/match-upload-store";
import type { MatchLibraryVideo } from "@jits/shared/api/film-room";
import { libItem, libVideo } from "../../support/film-fixtures";

type Local = "none" | Exclude<MatchUploadStatus, "pending" | "error"> | "failed";
type Server = "no row" | "reserved" | "processing" | "analyzed" | "failed";

const LOCALS: Local[] = ["none", "uploading", "paused", "failed", "uploaded"];
const SERVERS: Server[] = ["no row", "reserved", "processing", "analyzed", "failed"];

function entry(local: Local): MatchUploadEntry | null {
  if (local === "none") return null;
  const status: MatchUploadStatus = local === "failed" ? "error" : local;
  return {
    matchId: "m-1",
    status,
    videoId: local === "uploaded" ? "VID-1" : null,
    error: local === "paused" || local === "failed" ? "friendly copy" : null,
    errorClass: local === "paused" ? "offline" : local === "failed" ? "not_allowed" : null,
    bytesTotal: 600_000_000,
    truncation: null,
    storagePath: "m-1/me/1.mp4",
    progress: local === "uploaded" ? 1 : 0.42,
    updatedAt: 0,
  };
}

function serverVideos(server: Server): MatchLibraryVideo[] {
  switch (server) {
    case "no row":
      return [];
    case "reserved":
      return [libVideo({ status: "uploading", playability: "processing", has_analysis: false, poster_url: null })];
    case "processing":
      return [libVideo({ status: "processing", playability: "playable", has_analysis: false, poster_url: null })];
    case "analyzed":
      return [libVideo({ status: "analyzed", playability: "playable", has_analysis: true })];
    case "failed":
      return [libVideo({ status: "failed", playability: "failed", has_analysis: false, poster_url: null })];
  }
}

const NO_FILM = /NO FILM|No video/i;

describe.each(LOCALS)("local upload: %s", (local) => {
  describe.each(SERVERS)("server: %s", (server) => {
    const e = entry(local);
    const videos = serverVideos(server);
    const somethingExists = e != null || videos.length > 0;

    it("match detail never shows 'No video' while something exists", () => {
      const section = deriveFilmSection(e, videos.length);
      expect(section.noVideo).toBe(!somethingExists);
      // A local job always has its card (until its row is on screen).
      if (e && e.status !== "uploaded") expect(section.upload).toBe(true);
    });

    it("the still's caption never says 'no film' while something exists", () => {
      const caption = filmStillCaption(e, videos.length > 0, "NO FILM RECORDED");
      if (somethingExists) expect(caption).not.toMatch(NO_FILM);
      else expect(caption).toBe("NO FILM RECORDED");
      // Once the bytes are in, never "after upload".
      if (local === "uploaded" || (local === "none" && videos.length > 0)) {
        expect(caption).not.toMatch(/AFTER UPLOAD/);
      }
    });

    it("the Film Room card never reads as no film while something exists", () => {
      const status = deriveCardStatus(libItem({ videos }), e, true);
      if (somethingExists && status.kind === "none") {
        // "none" is only allowed when the server's film is simply seen and
        // has no breakdown; it never stands for "no film" when the phone
        // still owes the clip.
        expect(e == null || e.status === "uploaded").toBe(true);
        expect(videos.length).toBeGreaterThan(0);
      }
      if (local === "paused") expect(status.kind).toBe("paused");
      if (local === "failed") expect(status.kind).toBe("upload_failed");
    });
  });
});

describe("paused vs failed are distinct everywhere (jits-n2im.3)", () => {
  it("banner kinds", () => {
    expect(deriveUploadBannerState("idle", null, entry("paused")).kind).toBe("paused");
    expect(deriveUploadBannerState("idle", null, entry("failed")).kind).toBe("error");
  });

  it("card badges", () => {
    expect(statusBadgeLabel(deriveCardStatus(libItem(), entry("paused"), true))).toBe("UPLOAD PAUSED");
    expect(statusBadgeLabel(deriveCardStatus(libItem(), entry("failed"), true))).toBe("UPLOAD FAILED");
  });

  it("actions: Retry for paused and retryable failures, Discard for terminal ones", () => {
    const paused = deriveUploadBannerState("idle", null, entry("paused"));
    expect(uploadBannerActions(paused)).toEqual({ retry: true, discard: false });
    const failed = deriveUploadBannerState("idle", null, entry("failed"));
    expect(uploadBannerActions(failed)).toEqual({ retry: true, discard: false });
    const terminal = deriveUploadBannerState("idle", null, { ...entry("failed")!, errorClass: "reslice_limit" });
    expect(uploadBannerActions(terminal)).toEqual({ retry: false, discard: true });
    // The file is already gone: nothing to retry or discard.
    const gone = deriveUploadBannerState("idle", null, { ...entry("failed")!, errorClass: "file_missing" });
    expect(uploadBannerActions(gone)).toEqual({ retry: false, discard: false });
    // A recorder failure (no class) is not an upload to retry.
    expect(uploadBannerActions(deriveUploadBannerState("error", "Camera not ready", null))).toEqual({
      retry: false,
      discard: false,
    });
  });
});

describe("captions and labels", () => {
  it("say the progress while uploading and paused", () => {
    expect(filmStillCaption(entry("uploading"), false, "x")).toBe("UPLOADING 42% · STILL ARRIVES AFTER UPLOAD");
    expect(filmStillCaption(entry("paused"), false, "x")).toBe("UPLOAD PAUSED · 42%");
    expect(filmStillCaption(entry("failed"), false, "x")).toBe("UPLOAD FAILED");
    expect(filmStillCaption(entry("uploaded"), false, "x")).toBe("PROCESSING FILM");
    expect(uploadingLabel(null)).toBe("UPLOADING");
  });

  it("give the disabled Watch film a reason (jits-n2im.4 item 5)", () => {
    expect(watchFilmBusyLabel("uploading", 0.42)).toBe("Film uploading 42%");
    expect(watchFilmBusyLabel("uploading", null)).toBe("Film uploading…");
    expect(watchFilmBusyLabel("stopping", null)).toBe("Finishing recording…");
  });
});
