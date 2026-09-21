/**
 * Tests for the React Native tus shims (lib/video/tus-rn-shims.ts).
 *
 * These two pieces are the whole reason tus-js-client can run on a phone
 * at all, and both have a failure mode that is silent rather than loud:
 *
 *  - `ExpoFileSource` must tag every chunk with `size`. tus reads
 *    `value?.size` and, on the LAST chunk, rejects the entire upload with
 *    "the source is done after N bytes" when the running total does not
 *    match. A bare Uint8Array has `byteLength`, not `size`, so without the
 *    tag every upload would fail at 100%.
 *  - `AsyncStorageUrlStorage` replaces a localStorage-backed store that RN
 *    does not have. tus degrades it to a silent no-op rather than erroring.
 */

// ---- expo-file-system (new File/FileHandle API) ----

interface FakeHandle {
  offset: number | null;
  readBytes: jest.Mock;
  close: jest.Mock;
}

const mockHandles: FakeHandle[] = [];
const mockFileBytes = { current: new Uint8Array(0) };
const mockOpenThrows = { current: null as Error | null };

jest.mock("expo-file-system", () => ({
  File: class {
    uri: string;
    constructor(uri: string) {
      this.uri = uri;
    }
    open() {
      if (mockOpenThrows.current) throw mockOpenThrows.current;
      const handle: {
        offset: number | null;
        readBytes: jest.Mock;
        close: jest.Mock;
      } = {
        offset: null,
        readBytes: jest.fn(),
        close: jest.fn(),
      };
      handle.readBytes.mockImplementation((length: number): Uint8Array => {
        const from: number = handle.offset ?? 0;
        return mockFileBytes.current.slice(from, from + length);
      });
      mockHandles.push(handle);
      return handle;
    }
  },
}));

// ---- AsyncStorage ----

const mockStore = new Map<string, string>();
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: async (key: string) => mockStore.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      mockStore.set(key, value);
    },
    removeItem: async (key: string) => {
      mockStore.delete(key);
    },
    getAllKeys: async () => [...mockStore.keys()],
  },
}));

import {
  AsyncStorageUrlStorage,
  ExpoFileReader,
  ExpoFileSource,
  TUS_URL_STORAGE_PREFIX,
  type TusPreviousUpload,
} from "@/lib/video/tus-rn-shims";

const SIZE = 25;

function seedFile(size: number): void {
  mockFileBytes.current = Uint8Array.from({ length: size }, (_, i) => i % 256);
}

beforeEach(() => {
  mockHandles.length = 0;
  mockStore.clear();
  mockOpenThrows.current = null;
  seedFile(SIZE);
});

describe("ExpoFileSource", () => {
  it("tags every chunk with `size`, which tus needs to finish an upload", async () => {
    const source = new ExpoFileSource({ uri: "file://clip.mp4", size: SIZE });
    const { value } = await source.slice(0, 10);
    // The property tus reads. Without it, `valueSize` is 0 and the final
    // chunk trips "the source is done after 0 bytes".
    expect(value.size).toBe(10);
    expect(value.byteLength).toBe(10);
    expect(value).toBeInstanceOf(Uint8Array);
  });

  it("reads the requested window by absolute offset, so a retried chunk re-reads it", async () => {
    const source = new ExpoFileSource({ uri: "file://clip.mp4", size: SIZE });
    const first = await source.slice(6, 12);
    const again = await source.slice(6, 12);
    expect(Array.from(first.value)).toEqual([6, 7, 8, 9, 10, 11]);
    expect(Array.from(again.value)).toEqual([6, 7, 8, 9, 10, 11]);
  });

  it("clamps a window past EOF and reports done", async () => {
    const source = new ExpoFileSource({ uri: "file://clip.mp4", size: SIZE });
    const { value, done } = await source.slice(20, 20 + 6 * 1024 * 1024);
    expect(value.byteLength).toBe(5);
    expect(done).toBe(true);
  });

  it("is not done before EOF", async () => {
    const source = new ExpoFileSource({ uri: "file://clip.mp4", size: SIZE });
    expect((await source.slice(0, 10)).done).toBe(false);
    expect((await source.slice(10, 20)).done).toBe(false);
    expect((await source.slice(20, 25)).done).toBe(true);
  });

  it("marks a SHORT read done, which is what stops tus looping forever", async () => {
    // The file is smaller than the size this source was built with: it
    // changed underneath a resumed upload. The previous version of this
    // reported `done: false`, which is precisely the infinite loop it
    // claimed to prevent. tus sends the short chunk, the server echoes the
    // offset, `_performUpload()` recurses, and tus's own "source is done
    // after N bytes" guard never fires because it only runs on a chunk
    // marked done.
    //
    // Marked done, tus compares `offset + valueSize` against the configured
    // size, sees 3 != 10, and rejects: a clean failure the retry loop owns.
    seedFile(3);
    const source = new ExpoFileSource({ uri: "file://clip.mp4", size: 10 });
    const { value, done } = await source.slice(0, 10);
    expect(value.byteLength).toBe(3);
    expect(value.size).toBe(3);
    expect(done).toBe(true);
  });

  it("marks a zero-length read at the reported size done", async () => {
    const source = new ExpoFileSource({ uri: "file://clip.mp4", size: SIZE });
    expect((await source.slice(SIZE, SIZE + 10)).done).toBe(true);
  });

  it("does not mark a FULL read short, so a normal chunk keeps going", async () => {
    const source = new ExpoFileSource({ uri: "file://clip.mp4", size: SIZE });
    const { value, done } = await source.slice(0, 10);
    expect(value.byteLength).toBe(10);
    expect(done).toBe(false);
  });

  it("opens the handle once and holds it for the whole attempt", async () => {
    const source = new ExpoFileSource({ uri: "file://clip.mp4", size: SIZE });
    await source.slice(0, 5);
    await source.slice(5, 10);
    await source.slice(10, 15);
    expect(mockHandles).toHaveLength(1);
    source.close();
    expect(mockHandles[0].close).toHaveBeenCalledTimes(1);
  });

  it("opens lazily, so constructing a source for a missing file does not throw", () => {
    mockOpenThrows.current = new Error("no such file");
    expect(() => new ExpoFileSource({ uri: "file://gone.mp4", size: SIZE })).not.toThrow();
    expect(mockHandles).toHaveLength(0);
  });

  it("survives a close() whose handle has already gone away", async () => {
    const source = new ExpoFileSource({ uri: "file://clip.mp4", size: SIZE });
    await source.slice(0, 5);
    mockHandles[0].close.mockImplementation(() => {
      throw new Error("file deleted under us");
    });
    // A throw here would mask the upload's real outcome.
    expect(() => source.close()).not.toThrow();
  });

  it("refuses to read after close rather than reopening a stale handle", async () => {
    const source = new ExpoFileSource({ uri: "file://clip.mp4", size: SIZE });
    await source.slice(0, 5);
    source.close();
    await expect(source.slice(5, 10)).rejects.toThrow(/already closed/);
  });
});

describe("ExpoFileReader", () => {
  it("hands the source to onOpen so the caller can close it", async () => {
    // tus closes the source only when the upload SUCCEEDS, and `abort()`
    // deliberately does not, so without this a failed attempt leaks a
    // native file handle for the life of the process.
    const opened: Array<{ close: () => void }> = [];
    const reader = new ExpoFileReader((source) => opened.push(source));
    const source = await reader.openFile({ uri: "file://clip.mp4", size: SIZE }, 1);
    expect(opened).toEqual([source]);
  });

  it("is usable with no onOpen hook at all", async () => {
    await expect(
      new ExpoFileReader().openFile({ uri: "file://clip.mp4", size: SIZE }, 1),
    ).resolves.toBeTruthy();
  });

  it("accepts our { uri, size } input", async () => {
    const source = await new ExpoFileReader().openFile(
      { uri: "file://clip.mp4", size: SIZE },
      6 * 1024 * 1024,
    );
    expect(source.size).toBe(SIZE);
  });

  it("rejects an input tus would otherwise treat as a stream", async () => {
    await expect(
      new ExpoFileReader().openFile({ size: SIZE } as never, 1),
    ).rejects.toThrow(/uri, size/);
  });

  it("rejects a zero-byte recording instead of creating an empty upload", async () => {
    await expect(
      new ExpoFileReader().openFile({ uri: "file://clip.mp4", size: 0 }, 1),
    ).rejects.toThrow(/refusing to upload/);
  });
});

describe("AsyncStorageUrlStorage", () => {
  const entry = (uploadUrl: string): TusPreviousUpload => ({
    size: 100,
    metadata: {},
    creationTime: "2026-09-21T00:00:00.000Z",
    urlStorageKey: "",
    uploadUrl,
    parallelUploadUrls: null,
  });

  it("round-trips an upload by fingerprint", async () => {
    const storage = new AsyncStorageUrlStorage();
    const key = await storage.addUpload("fp-a", entry("https://up/1"));
    expect(key.startsWith(`${TUS_URL_STORAGE_PREFIX}fp-a::`)).toBe(true);

    const found = await storage.findUploadsByFingerprint("fp-a");
    expect(found).toHaveLength(1);
    expect(found[0].uploadUrl).toBe("https://up/1");
    // tus removes by this key, so it has to come back on the record.
    expect(found[0].urlStorageKey).toBe(key);
  });

  it("does not return another fingerprint's uploads", async () => {
    const storage = new AsyncStorageUrlStorage();
    await storage.addUpload("fp-a", entry("https://up/1"));
    await storage.addUpload("fp-b", entry("https://up/2"));
    expect(await storage.findUploadsByFingerprint("fp-a")).toHaveLength(1);
    expect(await storage.findAllUploads()).toHaveLength(2);
  });

  it("removes an upload by its storage key", async () => {
    const storage = new AsyncStorageUrlStorage();
    const key = await storage.addUpload("fp-a", entry("https://up/1"));
    await storage.removeUpload(key);
    expect(await storage.findAllUploads()).toHaveLength(0);
  });

  it("ignores other namespaces living in the same AsyncStorage", async () => {
    mockStore.set("elo-rated-theme-preference", "dark");
    mockStore.set("elo-video-upload::M1", '{"matchId":"M1"}');
    const storage = new AsyncStorageUrlStorage();
    expect(await storage.findAllUploads()).toHaveLength(0);
  });

  it("skips a malformed entry instead of failing the whole lookup", async () => {
    const storage = new AsyncStorageUrlStorage();
    await storage.addUpload("fp-a", entry("https://up/1"));
    mockStore.set(`${TUS_URL_STORAGE_PREFIX}fp-a::corrupt`, "{not json");
    const found = await storage.findUploadsByFingerprint("fp-a");
    expect(found).toHaveLength(1);
    expect(found[0].uploadUrl).toBe("https://up/1");
  });
});
