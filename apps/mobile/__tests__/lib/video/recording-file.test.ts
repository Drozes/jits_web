/**
 * Tests for custody of the local clip (lib/video/recording-file.ts).
 *
 * NOTE ON THE BACKUP-EXCLUSION TESTS BELOW. They assert that
 * `retainRecording` ASKS for the exclusion and that a refusal or a throw
 * cannot break retention. They do NOT and cannot prove that iOS actually
 * wrote `NSURLIsExcludedFromBackupKey`: that is a native resource value,
 * the native module is absent under Jest (`requireOptionalNativeModule`
 * returns null), and it can only be confirmed on a device or TestFlight
 * build via `isExcludedFromBackup()`.
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

const mockExcludeFromBackup = jest.fn((_uri: string) => true);

jest.mock("@/modules/backup-exclusion", () => ({
  excludeFromBackup: (uri: string) => mockExcludeFromBackup(uri),
  isBackupExclusionSupported: true,
}));

import {
  RETAINED_DIR_NAME,
  discardLocalClip,
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
  mockExcludeFromBackup.mockReset();
  mockExcludeFromBackup.mockReturnValue(true);
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

describe("backup exclusion (jits-vjbq)", () => {
  it("excludes the retention directory AND the clip", () => {
    // The directory covers backup traversal per Apple's QA1719; the file is
    // belt and braces, because that reading is the one claim here that
    // cannot be verified without a device.
    retainRecording(CACHE_URI, "M1", "mp4");
    expect(mockExcludeFromBackup.mock.calls.map((c) => c[0])).toEqual([
      `file:///docs/${RETAINED_DIR_NAME}`,
      RETAINED_URI,
    ]);
  });

  it("asks again when the directory ALREADY exists", () => {
    // The flag is a per-inode attribute. A directory can exist because an
    // earlier call created it and then failed to set the flag, or because a
    // device migration restored it, so "set it once at startup" would leave
    // both cases unprotected.
    mockDirs.set(`file:///docs/${RETAINED_DIR_NAME}`, { exists: true, created: false });
    retainRecording(CACHE_URI, "M1", "mp4");
    expect(mockExcludeFromBackup).toHaveBeenCalledWith(`file:///docs/${RETAINED_DIR_NAME}`);
  });

  it("still retains the clip when the exclusion is REFUSED", () => {
    // False is the normal Android answer and the normal answer on any build
    // without the native module. The upload matters more than the flag.
    mockExcludeFromBackup.mockReturnValue(false);
    expect(retainRecording(CACHE_URI, "M1", "mp4")).toBe(RETAINED_URI);
    expect(mockFiles.get(RETAINED_URI)?.exists).toBe(true);
  });

  it("still retains the clip when the exclusion THROWS", () => {
    mockExcludeFromBackup.mockImplementation(() => {
      throw new Error("native module blew up");
    });
    expect(retainRecording(CACHE_URI, "M1", "mp4")).toBe(RETAINED_URI);
    expect(mockFiles.get(RETAINED_URI)?.exists).toBe(true);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/backup exclusion threw/),
      expect.anything(),
    );
  });

  it("does not ask for the file when there was no clip to move", () => {
    retainRecording("file:///cache/gone.mp4", "M1", "mp4");
    // The directory is still worth excluding; the absent file is not, and
    // setting the flag on a missing path would silently do nothing anyway.
    expect(mockExcludeFromBackup).toHaveBeenCalledTimes(1);
    expect(mockExcludeFromBackup).toHaveBeenCalledWith(`file:///docs/${RETAINED_DIR_NAME}`);
  });

  it("does not ask at all when the directory could not be created", () => {
    mockThrowOn.create = true;
    expect(retainRecording(CACHE_URI, "M1", "mp4")).toBe(CACHE_URI);
    expect(mockExcludeFromBackup).not.toHaveBeenCalled();
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

describe("discardLocalClip (practice match)", () => {
  it("deletes a clip outside the retention directory", () => {
    discardLocalClip(CACHE_URI);
    expect(mockFiles.get(CACHE_URI)?.deleted).toBe(true);
  });

  it("is a no-op for a missing file or a null uri", () => {
    expect(() => discardLocalClip("file:///cache/gone.mp4")).not.toThrow();
    expect(() => discardLocalClip(null)).not.toThrow();
    expect(mockFiles.get(CACHE_URI)?.deleted).toBeUndefined();
  });

  it("swallows a delete failure", () => {
    mockThrowOn.delete = true;
    expect(() => discardLocalClip(CACHE_URI)).not.toThrow();
    expect(warnSpy).toHaveBeenCalled();
  });
});
