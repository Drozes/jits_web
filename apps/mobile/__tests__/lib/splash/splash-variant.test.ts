/**
 * Tests for the splash-variant device override (AsyncStorage-backed), which
 * mirrors the elo-cache pattern. Falls back to DEFAULT_SPLASH_VARIANT on an
 * empty / invalid / unreadable value.
 *
 * Source: apps/mobile/lib/splash/splash-variant.ts
 */

// In-memory AsyncStorage mock (the real module is native). jest.mock is hoisted,
// so the factory may only reference variables prefixed with `mock`.
const mockStore = new Map<string, string>();
const mockGetItem = jest.fn(async (key: string) => mockStore.get(key) ?? null);
const mockSetItem = jest.fn(async (key: string, value: string) => {
  mockStore.set(key, value);
});

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: (key: string) => mockGetItem(key),
    setItem: (key: string, value: string) => mockSetItem(key, value),
  },
}));

import { getSplashVariant, setSplashVariant } from "@/lib/splash/splash-variant";

const KEY = "elo-rated:splash-variant";

beforeEach(() => {
  mockStore.clear();
  mockGetItem.mockClear();
  mockSetItem.mockClear();
  mockGetItem.mockImplementation(async (key: string) => mockStore.get(key) ?? null);
  mockSetItem.mockImplementation(async (key: string, value: string) => {
    mockStore.set(key, value);
  });
});

describe("getSplashVariant", () => {
  it("returns the default ('glow-statement') when storage is empty", async () => {
    await expect(getSplashVariant()).resolves.toBe("glow-statement");
  });

  it("returns the stored value when it is a valid variant", async () => {
    mockStore.set(KEY, "climb");
    await expect(getSplashVariant()).resolves.toBe("climb");
  });

  it("returns the stored value for every registered variant", async () => {
    for (const v of ["climb", "statement", "glow-statement"]) {
      mockStore.set(KEY, v);
      await expect(getSplashVariant()).resolves.toBe(v);
    }
  });

  it("returns the default when the stored value is invalid", async () => {
    mockStore.set(KEY, "not-a-real-variant");
    await expect(getSplashVariant()).resolves.toBe("glow-statement");
  });

  it("falls back to the default when getItem throws", async () => {
    mockGetItem.mockRejectedValueOnce(new Error("boom"));
    await expect(getSplashVariant()).resolves.toBe("glow-statement");
  });
});

describe("setSplashVariant", () => {
  it("writes the value to storage", async () => {
    await setSplashVariant("climb");
    expect(mockSetItem).toHaveBeenCalledWith(KEY, "climb");
    expect(mockStore.get(KEY)).toBe("climb");
  });

  it("swallows setItem errors", async () => {
    mockSetItem.mockRejectedValueOnce(new Error("boom"));
    await expect(setSplashVariant("statement")).resolves.toBeUndefined();
  });
});
