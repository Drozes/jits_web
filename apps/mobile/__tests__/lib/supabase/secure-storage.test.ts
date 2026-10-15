/**
 * Tests for the chunked SecureStore adapter (jits-3ie.7).
 *
 * The adapter splits the Supabase auth session into sub-2048-byte chunks across
 * `${key}.0`, `${key}.1`, ... plus a `${key}.meta` count key, then reassembles
 * the full value on read. These tests run against an in-memory mock of
 * `expo-secure-store` and force `Platform.OS = "ios"` so the native (chunking)
 * branch is exercised, not the web/localStorage branch.
 */

// ---------------------------------------------------------------------------
// Mocks -- all variables referenced inside jest.mock() must be prefixed "mock"
// ---------------------------------------------------------------------------

// In-memory SecureStore. Keys map to string values, mirroring the native API.
let mockStore: Record<string, string> = {};

jest.mock("expo-secure-store", () => ({
  __esModule: true,
  getItemAsync: jest.fn(async (key: string) =>
    Object.prototype.hasOwnProperty.call(mockStore, key) ? mockStore[key] : null,
  ),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockStore[key] = value;
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    delete mockStore[key];
  }),
}));

// Force the native code path (chunking). Default Platform.OS in jest-expo is
// "ios" already, but we pin it so the test is explicit and stable.
jest.mock("react-native", () => ({
  __esModule: true,
  Platform: { OS: "ios" },
}));

// ---------------------------------------------------------------------------
// Import under test
// ---------------------------------------------------------------------------

import * as SecureStore from "expo-secure-store";
import { SecureStoreAdapter } from "@/lib/supabase/secure-storage";

const KEY = "sb-auth-token";

const utf8Bytes = (value: string): number => new TextEncoder().encode(value).length;

beforeEach(() => {
  mockStore = {};
  jest.clearAllMocks();
});

describe("SecureStoreAdapter (chunked)", () => {
  it("round-trips a >2KB string with exact reassembly", async () => {
    // ~7KB of ASCII, comfortably across multiple 2000-byte chunks.
    const big = "x".repeat(7000);

    await SecureStoreAdapter.setItem(KEY, big);
    const out = await SecureStoreAdapter.getItem(KEY);

    expect(out).toBe(big);
  });

  it("never writes a chunk larger than the 2048-byte limit", async () => {
    const big = "y".repeat(7000);
    await SecureStoreAdapter.setItem(KEY, big);

    const chunkKeys = Object.keys(mockStore).filter((k) => /\.\d+$/.test(k));
    expect(chunkKeys.length).toBeGreaterThan(1);
    for (const k of chunkKeys) {
      expect(utf8Bytes(mockStore[k])).toBeLessThanOrEqual(2048);
    }
  });

  it("splits on code-point boundaries so multi-byte UTF-8 round-trips", async () => {
    // Emoji are 4 UTF-8 bytes each; 1000 of them is ~4KB across chunks.
    const emoji = "🥋".repeat(1000) + "BJJ" + "é".repeat(500);

    await SecureStoreAdapter.setItem(KEY, emoji);
    const out = await SecureStoreAdapter.getItem(KEY);

    expect(out).toBe(emoji);
    const chunkKeys = Object.keys(mockStore).filter((k) => /\.\d+$/.test(k));
    for (const k of chunkKeys) {
      expect(utf8Bytes(mockStore[k])).toBeLessThanOrEqual(2048);
    }
  });

  it("round-trips a small (single-chunk) value and an empty string", async () => {
    await SecureStoreAdapter.setItem(KEY, "tiny");
    expect(await SecureStoreAdapter.getItem(KEY)).toBe("tiny");

    await SecureStoreAdapter.setItem(KEY, "");
    expect(await SecureStoreAdapter.getItem(KEY)).toBe("");
  });

  it("returns null when nothing is stored", async () => {
    expect(await SecureStoreAdapter.getItem(KEY)).toBeNull();
  });

  it("removeItem clears every chunk, the meta key, and the legacy key", async () => {
    const big = "z".repeat(7000);
    await SecureStoreAdapter.setItem(KEY, big);
    // Simulate a stray legacy single-key value lingering alongside.
    mockStore[KEY] = "legacy";

    await SecureStoreAdapter.removeItem(KEY);

    expect(mockStore).toEqual({});
    expect(await SecureStoreAdapter.getItem(KEY)).toBeNull();
  });

  it("token rotation rewrites all chunks and orphans no leftover chunks", async () => {
    // Long value first (many chunks), then a shorter value (fewer chunks).
    const long = "a".repeat(9000);
    await SecureStoreAdapter.setItem(KEY, long);
    const longChunkCount = Object.keys(mockStore).filter((k) =>
      /\.\d+$/.test(k),
    ).length;
    expect(longChunkCount).toBeGreaterThan(2);

    const short = "b".repeat(2500);
    await SecureStoreAdapter.setItem(KEY, short);

    // Reassembly returns only the new value...
    expect(await SecureStoreAdapter.getItem(KEY)).toBe(short);

    // ...and no higher-index chunks from the longer value remain.
    const shortChunkCount = Object.keys(mockStore).filter((k) =>
      /\.\d+$/.test(k),
    ).length;
    expect(shortChunkCount).toBeLessThan(longChunkCount);
    expect(mockStore[`${KEY}.meta`]).toBe(String(shortChunkCount));
    expect(mockStore[`${KEY}.${shortChunkCount}`]).toBeUndefined();
  });

  it("migrates a legacy single-key value: getItem returns it, setItem re-chunks", async () => {
    // Legacy build wrote the whole session under the bare key, no meta.
    const legacyValue = "legacy-session-payload";
    mockStore[KEY] = legacyValue;

    // getItem falls back to the legacy value so the user stays signed in.
    expect(await SecureStoreAdapter.getItem(KEY)).toBe(legacyValue);

    // Next write re-chunks and drops the legacy single key.
    const fresh = "c".repeat(5000);
    await SecureStoreAdapter.setItem(KEY, fresh);

    expect(mockStore[KEY]).toBeUndefined(); // legacy key gone
    expect(mockStore[`${KEY}.meta`]).toBeDefined();
    expect(await SecureStoreAdapter.getItem(KEY)).toBe(fresh);
  });

  it("getItem returns null if a chunk is missing (no partial sessions)", async () => {
    const big = "d".repeat(7000);
    await SecureStoreAdapter.setItem(KEY, big);

    // Corrupt the store by deleting a middle chunk.
    delete mockStore[`${KEY}.1`];

    expect(await SecureStoreAdapter.getItem(KEY)).toBeNull();
  });

  it("uses async SecureStore APIs (drop-in adapter contract preserved)", async () => {
    await SecureStoreAdapter.setItem(KEY, "v".repeat(5000));
    await SecureStoreAdapter.getItem(KEY);
    await SecureStoreAdapter.removeItem(KEY);

    expect(SecureStore.setItemAsync).toHaveBeenCalled();
    expect(SecureStore.getItemAsync).toHaveBeenCalled();
    expect(SecureStore.deleteItemAsync).toHaveBeenCalled();
  });
});

describe("SecureStoreAdapter undecryptable values (jits-mafl.1)", () => {
  // On Android a value whose Keystore key is gone (restored from a backup,
  // reinstall) makes getItemAsync throw. The adapter must read as signed out
  // and drop the dead entry, never reject and wedge the auth gate.
  const getMock = SecureStore.getItemAsync as jest.Mock;
  const deleteMock = SecureStore.deleteItemAsync as jest.Mock;
  const DECRYPT = new Error("Could not decrypt the value");

  function failReadsOf(keys: string[]) {
    const real = getMock.getMockImplementation()!;
    getMock.mockImplementation(async (k: string) => {
      if (keys.includes(k)) throw DECRYPT;
      return real(k);
    });
  }
  afterEach(() => {
    getMock.mockImplementation(async (key: string) =>
      Object.prototype.hasOwnProperty.call(mockStore, key) ? mockStore[key] : null,
    );
    deleteMock.mockImplementation(async (key: string) => {
      delete mockStore[key];
    });
  });

  it("a chunk that will not decrypt: null, and every chunk, the meta and the legacy key are deleted", async () => {
    await SecureStoreAdapter.setItem(KEY, "e".repeat(7000));
    mockStore[KEY] = "legacy";
    failReadsOf([`${KEY}.1`]);
    await expect(SecureStoreAdapter.getItem(KEY)).resolves.toBeNull();
    expect(mockStore).toEqual({});
  });

  it("an unreadable meta key: null, and a bounded sweep clears the chunks", async () => {
    await SecureStoreAdapter.setItem(KEY, "f".repeat(5000));
    failReadsOf([`${KEY}.meta`]);
    await expect(SecureStoreAdapter.getItem(KEY)).resolves.toBeNull();
    expect(mockStore).toEqual({});
  });

  it("an unreadable legacy single key: null and deleted", async () => {
    mockStore[KEY] = "legacy";
    failReadsOf([KEY]);
    await expect(SecureStoreAdapter.getItem(KEY)).resolves.toBeNull();
    expect(mockStore).toEqual({});
  });

  it("a failing delete during cleanup still resolves null and deletes the rest", async () => {
    await SecureStoreAdapter.setItem(KEY, "g".repeat(5000));
    failReadsOf([`${KEY}.0`]);
    deleteMock.mockImplementation(async (k: string) => {
      if (k === `${KEY}.1`) throw new Error("delete failed");
      delete mockStore[k];
    });
    await expect(SecureStoreAdapter.getItem(KEY)).resolves.toBeNull();
    expect(Object.keys(mockStore)).toEqual([`${KEY}.1`]);
  });

  it("removeItem never throws on an unreadable meta or a failed delete", async () => {
    await SecureStoreAdapter.setItem(KEY, "h".repeat(5000));
    failReadsOf([`${KEY}.meta`]);
    deleteMock.mockImplementation(async (k: string) => {
      if (k === `${KEY}.0`) throw new Error("delete failed");
      delete mockStore[k];
    });
    await expect(SecureStoreAdapter.removeItem(KEY)).resolves.toBeUndefined();
    expect(Object.keys(mockStore)).toEqual([`${KEY}.0`]);
  });
});
