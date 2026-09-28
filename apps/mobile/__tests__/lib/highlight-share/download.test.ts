/**
 * The share download (jr_be spec 014 section 16.6.1): cache target, reuse,
 * progress, 60 s timeout, non-2xx cleanup, in-flight sharing, 24 h sweep and
 * the sign-out clear. `expo-file-system/legacy` is replaced by an in-memory
 * fake so every file operation is observable.
 */

interface FakeFile {
  size: number;
  mtimeS: number;
}

// eslint-disable-next-line no-var
var mockFiles: Map<string, FakeFile>;
const mockDownloadBehaviour: {
  current: (
    url: string,
    uri: string,
    progress: (p: { totalBytesWritten: number; totalBytesExpectedToWrite: number }) => void,
  ) => Promise<{ status: number; uri: string } | undefined>;
} = { current: async () => undefined };
const mockCancel = jest.fn(async () => undefined);
const mockCreate = jest.fn();
const mockDelete = jest.fn();

jest.mock("expo-file-system/legacy", () => ({
  cacheDirectory: "file:///cache/",
  getInfoAsync: async (uri: string) => {
    const f = mockFiles.get(uri);
    return f
      ? { exists: true, isDirectory: false, size: f.size, modificationTime: f.mtimeS, uri }
      : { exists: false, isDirectory: false, uri };
  },
  makeDirectoryAsync: async () => undefined,
  deleteAsync: async (uri: string) => {
    mockDelete(uri);
    for (const key of [...mockFiles.keys()]) {
      if (key === uri || key.startsWith(uri.endsWith("/") ? uri : `${uri}/`)) mockFiles.delete(key);
    }
  },
  moveAsync: async ({ from, to }: { from: string; to: string }) => {
    const f = mockFiles.get(from);
    if (!f) throw new Error("missing");
    mockFiles.delete(from);
    mockFiles.set(to, f);
  },
  readDirectoryAsync: async (dir: string) => {
    const names = [...mockFiles.keys()].filter((k) => k.startsWith(dir)).map((k) => k.slice(dir.length));
    if (names.length === 0) throw new Error("no dir");
    return names;
  },
  createDownloadResumable: (
    url: string,
    uri: string,
    _opts: unknown,
    progress: (p: { totalBytesWritten: number; totalBytesExpectedToWrite: number }) => void,
  ) => {
    mockCreate(url, uri);
    return {
      downloadAsync: () => mockDownloadBehaviour.current(url, uri, progress),
      cancelAsync: mockCancel,
    };
  },
}));

import {
  clearShareCache,
  deleteCachedFile,
  downloadReel,
  safeFileName,
  sweepShareCache,
} from "@/lib/highlight-share/download";

const DIR = "file:///cache/highlight-share/";
const NAME = "elorated-highlight-abcd1234-v2.mp4";
const TARGET = `${DIR}${NAME}`;

function okDownload(size = 2048) {
  return async (
    _url: string,
    uri: string,
    progress: (p: { totalBytesWritten: number; totalBytesExpectedToWrite: number }) => void,
  ) => {
    progress({ totalBytesWritten: size / 2, totalBytesExpectedToWrite: size });
    progress({ totalBytesWritten: size, totalBytesExpectedToWrite: size });
    mockFiles.set(uri, { size, mtimeS: Date.now() / 1000 });
    return { status: 200, uri };
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useRealTimers();
  mockFiles = new Map();
  mockDownloadBehaviour.current = okDownload();
});

describe("downloadReel", () => {
  it("downloads into cache/highlight-share/<fileName> via a .part file, with progress", async () => {
    const progress: Array<number | null> = [];
    const result = await downloadReel({ fileName: NAME }, "https://signed", (f) => progress.push(f));
    expect(mockCreate).toHaveBeenCalledWith("https://signed", `${TARGET}.part`);
    expect(result).toMatchObject({ ok: true, uri: TARGET, byteCount: 2048, reused: false });
    expect(progress).toEqual([0.5, 1]);
    expect(mockFiles.has(`${TARGET}.part`)).toBe(false);
    expect(mockFiles.has(TARGET)).toBe(true);
  });

  it("reuses a complete cached file of the same name without downloading", async () => {
    mockFiles.set(TARGET, { size: 99, mtimeS: 1 });
    const result = await downloadReel({ fileName: NAME }, "https://signed");
    expect(result).toMatchObject({ ok: true, uri: TARGET, byteCount: 99, reused: true });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("does not reuse an empty file", async () => {
    mockFiles.set(TARGET, { size: 0, mtimeS: 1 });
    const result = await downloadReel({ fileName: NAME }, "https://signed");
    expect(result).toMatchObject({ ok: true, reused: false, byteCount: 2048 });
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("a non-2xx deletes the partial file and fails download_http", async () => {
    mockDownloadBehaviour.current = async (_u, uri) => {
      mockFiles.set(uri, { size: 120, mtimeS: 1 });
      return { status: 403, uri };
    };
    const result = await downloadReel({ fileName: NAME }, "https://signed");
    expect(result).toMatchObject({ ok: false, failure: "download_http", status: 403 });
    expect(mockFiles.size).toBe(0);
  });

  it("a timeout cancels, deletes the partial file and fails download_timeout", async () => {
    mockDownloadBehaviour.current = async (_u, uri) => {
      mockFiles.set(uri, { size: 10, mtimeS: 1 });
      return new Promise(() => undefined); // never settles
    };
    const result = await downloadReel({ fileName: NAME }, "https://signed", undefined, 20);
    expect(result).toMatchObject({ ok: false, failure: "download_timeout" });
    expect(mockCancel).toHaveBeenCalled();
    expect(mockFiles.size).toBe(0);
  });

  it("a throw deletes the partial file and fails unknown", async () => {
    mockDownloadBehaviour.current = async (_u, uri) => {
      mockFiles.set(uri, { size: 10, mtimeS: 1 });
      throw new Error("network");
    };
    const result = await downloadReel({ fileName: NAME }, "https://signed");
    expect(result).toMatchObject({ ok: false, failure: "unknown" });
    expect(mockFiles.size).toBe(0);
  });

  it("concurrent callers for the same file share one download", async () => {
    const [a, b] = await Promise.all([
      downloadReel({ fileName: NAME }, "https://signed"),
      downloadReel({ fileName: NAME }, "https://signed"),
    ]);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
  });

  it("sanitises the server file name", () => {
    expect(safeFileName("../../etc/passwd")).toBe("_.._etc_passwd");
    expect(safeFileName("")).toBe("elorated-highlight.mp4");
    expect(safeFileName(NAME)).toBe(NAME);
  });

  it("deleteCachedFile removes one file", async () => {
    mockFiles.set(TARGET, { size: 5, mtimeS: 1 });
    await deleteCachedFile(TARGET);
    expect(mockFiles.has(TARGET)).toBe(false);
  });
});

describe("sweepShareCache / clearShareCache", () => {
  const NOW = 2_000_000_000_000;

  it("deletes only files older than 24 h", async () => {
    mockFiles.set(`${DIR}old.mp4`, { size: 1, mtimeS: (NOW - 25 * 3600_000) / 1000 });
    mockFiles.set(`${DIR}old.mp4.part`, { size: 1, mtimeS: (NOW - 30 * 3600_000) / 1000 });
    mockFiles.set(`${DIR}fresh.mp4`, { size: 1, mtimeS: (NOW - 23 * 3600_000) / 1000 });
    await sweepShareCache(NOW);
    expect([...mockFiles.keys()]).toEqual([`${DIR}fresh.mp4`]);
  });

  it("is a quiet no-op without a cache directory", async () => {
    await expect(sweepShareCache(NOW)).resolves.toBeUndefined();
  });

  it("clearShareCache removes the whole directory", async () => {
    mockFiles.set(`${DIR}a.mp4`, { size: 1, mtimeS: 1 });
    mockFiles.set(`${DIR}b.mp4`, { size: 1, mtimeS: 1 });
    mockFiles.set("file:///cache/other.txt", { size: 1, mtimeS: 1 });
    await clearShareCache();
    expect(mockDelete).toHaveBeenCalledWith(DIR);
    expect([...mockFiles.keys()]).toEqual(["file:///cache/other.txt"]);
  });

  it("a finished download stays in the cache (only the sweep or sign-out remove it)", async () => {
    const result = await downloadReel({ fileName: NAME }, "https://signed");
    expect(result.ok).toBe(true);
    expect(mockFiles.has(TARGET)).toBe(true);
  });
});
