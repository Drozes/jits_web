import { describe, it, expect, afterEach, vi } from "vitest";
import { MIME_PREFERENCE, extensionFor, pickMimeType } from "./recorder-codec";

/** Stub MediaRecorder.isTypeSupported with an explicit allow-list. */
function stubSupport(supported: string[]) {
  vi.stubGlobal("MediaRecorder", {
    isTypeSupported: (t: string) => supported.includes(t),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("pickMimeType", () => {
  it("prefers MP4/H.264 over WebM when both are supported (Chromium)", () => {
    stubSupport([
      'video/mp4;codecs="avc1.42E01E"',
      "video/webm;codecs=vp9",
      "video/webm",
    ]);
    expect(pickMimeType()).toBe('video/mp4;codecs="avc1.42E01E"');
  });

  it("picks MP4 on Safari, which supports no WebM type at all", () => {
    // The jits-rvc regression: this used to fall through to an unsupported
    // "video/webm" and throw inside the MediaRecorder constructor.
    stubSupport(["video/mp4"]);
    expect(pickMimeType()).toBe("video/mp4");
  });

  it("falls back to WebM when the browser has no MP4 encoder", () => {
    stubSupport(["video/webm;codecs=vp9", "video/webm"]);
    expect(pickMimeType()).toBe("video/webm;codecs=vp9");
  });

  it("returns null when nothing is supported, rather than an unsupported type", () => {
    stubSupport([]);
    expect(pickMimeType()).toBeNull();
  });

  it("returns null when MediaRecorder is absent (SSR / old browser)", () => {
    vi.stubGlobal("MediaRecorder", undefined);
    expect(pickMimeType()).toBeNull();
  });

  it("only ever returns a type the browser actually reported as supported", () => {
    for (const candidate of MIME_PREFERENCE) {
      stubSupport([candidate]);
      expect(pickMimeType()).toBe(candidate);
    }
  });
});

describe("extensionFor", () => {
  it("maps every MP4 variant to mp4", () => {
    expect(extensionFor("video/mp4")).toBe("mp4");
    expect(extensionFor('video/mp4;codecs="avc1.42E01E"')).toBe("mp4");
  });

  it("maps every WebM variant to webm", () => {
    expect(extensionFor("video/webm")).toBe("webm");
    expect(extensionFor("video/webm;codecs=vp8")).toBe("webm");
  });

  it("derives an extension from an unexpected container instead of guessing", () => {
    expect(extensionFor("video/x-matroska;codecs=avc1")).toBe("x-matroska");
  });

  it("falls back to mp4 for unparseable input", () => {
    expect(extensionFor("")).toBe("mp4");
  });

  it("produces an extension for every preferred type", () => {
    for (const t of MIME_PREFERENCE) {
      expect(["mp4", "webm"]).toContain(extensionFor(t));
    }
  });
});
