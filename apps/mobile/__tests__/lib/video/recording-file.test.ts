/**
 * Tests for custody of the local clip (lib/video/recording-file.ts).
 *
 * `expo-camera` writes recordings into the app's CACHE directory, which
 * both platforms are free to purge and which iOS purges aggressively for
 * backgrounded apps. Persisting an upload job that points there would be
 * persistence in name only, so the clip is moved somewhere durable before
 * the first byte is sent. Everything here is best effort: a filesystem
 * problem must degrade the RESUME story, never block the upload.
 */

interface FakeEntry {
  uri: string;
  exists: boolean;
  deleted?: boolean;
}

const mockFiles = new Map<string, FakeEntry>();
const mockDirs = new Map<string, { exists: boolean; created: boolean }>();
const mockThrowOn = { create: false, move: false, delete: false };

jest.mock("expo-file-system", () => {
  const join = (parts: unknown[]): string =>
    parts
      .map((part) =>
        typeof part === "string"
          ? part
          : ((part as { uri?: string }).uri ?? String(part)),
      )
      .join("/");

  class Directory {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = join(parts);
    }
    get exists(): boolean {
      return mockDirs.get(this.uri)?.exists ?? false;
    }
    create() {
      if (mockThrowOn.create) throw new Error("no space");
      mockDirs.set(this.uri, { exists: true, created: true });
    }
  }

  class File {
    uri: string;
    constructor(...parts: unknown[]) {
      this.uri = join(parts);
    }
    get exists(): boolean {
      return mockFiles.get(this.uri)?.exists ?? false;
    }
    delete() {
      if (mockThrowOn.delete) throw new Error("locked");
      const entry = mockFiles.get(this.uri);
      if (entry) {
        entry.exists = false;
        entry.deleted = true;
      }
    }
    move(destination: { uri: string }) {
      if (mockThrowOn.move) throw new Error("cross-device move");
      const entry = mockFiles.get(this.uri);
      mockFiles.delete(this.uri);
      mockFiles.set(destination.uri, { uri: destination.uri, exists: entry?.exists ?? true });
      this.uri = destination.uri;
    }
  }

  return { Directory, File, Paths: { document: "file:///docs" } };
});

import {
  RETAINED_DIR_NAME,
  releaseRecording,
  retainRecording,
} from "@/lib/video/recording-file";

const CACHE_URI = "file:///cache/recording-1.mp4";
const RETAINED_URI = `file:///docs/${RETAINED_DIR_NAME}/M1.mp4`;

let warnSpy: jest.SpyInstance;

beforeEach(() => {
  mockFiles.clear();
  mockDirs.clear();
  mockThrowOn.create = false;
  mockThrowOn.move = false;
  mockThrowOn.delete = false;
  mockFiles.set(CACHE_URI, { uri: CACHE_URI, exists: true });
  warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  warnSpy.mockRestore();
});

describe("retainRecording", () => {
  it("moves the clip out of the cache and returns its new URI", () => {
    expect(retainRecording(CACHE_URI, "M1", "mp4")).toBe(RETAINED_URI);
    expect(mockFiles.has(CACHE_URI)).toBe(false);
    expect(mockFiles.get(RETAINED_URI)?.exists).toBe(true);
  });

  it("creates the retention directory on first use", () => {
    retainRecording(CACHE_URI, "M1", "mp4");
    expect(mockDirs.get(`file:///docs/${RETAINED_DIR_NAME}`)?.created).toBe(true);
  });

  it("does not recreate a directory that already exists", () => {
    mockDirs.set(`file:///docs/${RETAINED_DIR_NAME}`, { exists: true, created: false });
    retainRecording(CACHE_URI, "M1", "mp4");
    expect(mockDirs.get(`file:///docs/${RETAINED_DIR_NAME}`)?.created).toBe(false);
  });

  it("replaces a previous clip for the same match", () => {
    // Re-recording the same match supersedes the earlier clip, and its job
    // record is replaced too, so the old file has no owner left.
    mockFiles.set(RETAINED_URI, { uri: RETAINED_URI, exists: true });
    expect(retainRecording(CACHE_URI, "M1", "mp4")).toBe(RETAINED_URI);
    expect(mockFiles.get(RETAINED_URI)?.exists).toBe(true);
  });

  it("falls back to the original URI when the move fails", () => {
    // A cache-resident clip that uploads NOW beats no upload at all; only
    // the cross-restart resume is weakened.
    mockThrowOn.move = true;
    expect(retainRecording(CACHE_URI, "M1", "mp4")).toBe(CACHE_URI);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/could not retain recording/),
      expect.anything(),
    );
  });

  it("falls back when the directory cannot be created", () => {
    mockThrowOn.create = true;
    expect(retainRecording(CACHE_URI, "M1", "mp4")).toBe(CACHE_URI);
  });

  it("returns the original URI when there is no such file", () => {
    expect(retainRecording("file:///cache/gone.mp4", "M1", "mp4")).toBe("file:///cache/gone.mp4");
  });

  it("keeps the recorded extension", () => {
    expect(retainRecording(CACHE_URI, "M1", "webm")).toBe(
      `file:///docs/${RETAINED_DIR_NAME}/M1.webm`,
    );
  });
});

describe("releaseRecording", () => {
  it("deletes a clip we retained", () => {
    mockFiles.set(RETAINED_URI, { uri: RETAINED_URI, exists: true });
    releaseRecording(RETAINED_URI);
    expect(mockFiles.get(RETAINED_URI)?.deleted).toBe(true);
  });

  it("refuses to delete a file outside our own directory", () => {
    // `fileUri` is still the camera's cache path when the move fell back,
    // and could be a user-picked video. Deleting something we do not own
    // is a far worse bug than leaving a cache file for the OS to reap.
    releaseRecording(CACHE_URI);
    expect(mockFiles.get(CACHE_URI)?.deleted).toBeUndefined();
    expect(mockFiles.get(CACHE_URI)?.exists).toBe(true);
  });

  it("is a no-op for a file that is already gone", () => {
    expect(() => releaseRecording(RETAINED_URI)).not.toThrow();
  });

  it("never throws when the delete fails", () => {
    mockFiles.set(RETAINED_URI, { uri: RETAINED_URI, exists: true });
    mockThrowOn.delete = true;
    expect(() => releaseRecording(RETAINED_URI)).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/could not delete retained recording/),
      expect.anything(),
    );
  });
});
