/**
 * getShareCapabilities (jr_be spec 014 section 16.6.1): the detection matrix,
 * and the rule that a missing native module degrades instead of throwing.
 */
import { Linking, Platform } from "react-native";

// eslint-disable-next-line no-var
var mockNative: Record<string, unknown> = {};
jest.mock("expo-modules-core", () => {
  const actual = jest.requireActual("expo-modules-core");
  return {
    ...actual,
    requireOptionalNativeModule: (name: string) =>
      mockNative && name in mockNative ? mockNative[name] : actual.requireOptionalNativeModule(name),
  };
});

const mockSharingAvailable = jest.fn();
jest.mock("expo-sharing", () => ({
  isAvailableAsync: (...args: unknown[]) => mockSharingAvailable(...args),
  shareAsync: jest.fn(),
}));

// eslint-disable-next-line no-var
var mockReels = { supported: true };
jest.mock("@/modules/instagram-reels", () => {
  const mocked = { __esModule: true };
  Object.defineProperty(mocked, "isReelsShareSupported", {
    enumerable: true,
    get: () => (mockReels ? mockReels.supported : true),
  });
  return mocked;
});

// eslint-disable-next-line no-var
var mockEnv: { facebookAppId: string | null } = { facebookAppId: "fb" };
jest.mock("@/lib/env", () => ({
  env: {
    get facebookAppId() {
      return mockEnv ? mockEnv.facebookAppId : null;
    },
  },
}));

import { getShareCapabilities, INSTAGRAM_REELS_URL } from "@/lib/highlight-share/capabilities";
import { copyText } from "@/lib/highlight-share/clipboard";

const originalOS = Platform.OS;
function setOS(os: "ios" | "android") {
  Object.defineProperty(Platform, "OS", { configurable: true, get: () => os });
}

let canOpen: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  for (const key of Object.keys(mockNative)) delete mockNative[key];
  mockNative.ExpoSharing = {};
  mockNative.ExpoMediaLibrary = {};
  mockNative.ExpoClipboard = null;
  mockReels.supported = true;
  mockEnv.facebookAppId = "fb";
  mockSharingAvailable.mockResolvedValue(true);
  canOpen = jest.spyOn(Linking, "canOpenURL").mockResolvedValue(true);
  setOS("ios");
});

afterEach(() => {
  canOpen.mockRestore();
  Object.defineProperty(Platform, "OS", { configurable: true, get: () => originalOS });
});

type Case = [string, "ios" | "android", boolean, string | null, boolean, boolean];
// [label, os, reels module, app id, canOpenURL, expected reels]
const REELS_MATRIX: Case[] = [
  ["ios, everything present", "ios", true, "fb", true, true],
  ["ios, Instagram not detected", "ios", true, "fb", false, false],
  ["ios, no App ID", "ios", true, null, true, false],
  ["ios, no Reels module", "ios", false, "fb", true, false],
  ["android, no pre-check", "android", true, "fb", false, true],
  ["android, no App ID", "android", true, null, true, false],
  ["android, no Reels module", "android", false, "fb", true, false],
];

describe("reels capability", () => {
  it.each(REELS_MATRIX)("%s", async (_label, os, module, appId, canOpenUrl, expected) => {
    setOS(os);
    mockReels.supported = module;
    mockEnv.facebookAppId = appId;
    canOpen.mockResolvedValue(canOpenUrl);
    const caps = await getShareCapabilities();
    expect(caps.reels).toBe(expected);
    expect(caps.reelsModule).toBe(module);
    expect(caps.facebookAppIdConfigured).toBe(appId !== null);
    if (os === "ios") {
      expect(canOpen).toHaveBeenCalledWith(INSTAGRAM_REELS_URL);
      expect(caps.instagramDetected).toBe(canOpenUrl);
    } else {
      expect(canOpen).not.toHaveBeenCalled();
      expect(caps.instagramDetected).toBeNull();
    }
  });

  it("a throwing canOpenURL reads as not detected", async () => {
    canOpen.mockRejectedValue(new Error("no plist entry"));
    const caps = await getShareCapabilities();
    expect(caps.instagramDetected).toBe(false);
    expect(caps.reels).toBe(false);
  });
});

describe("share sheet, photos, clipboard", () => {
  it("all present", async () => {
    mockNative.ExpoClipboard = { setStringAsync: jest.fn() };
    const caps = await getShareCapabilities();
    expect(caps).toMatchObject({ shareSheet: true, saveToPhotos: true, clipboard: true });
  });

  it("each absent module reads as unavailable, without requiring its JS package", async () => {
    mockNative.ExpoSharing = null;
    mockNative.ExpoMediaLibrary = null;
    const caps = await getShareCapabilities();
    expect(caps).toMatchObject({ shareSheet: false, saveToPhotos: false, clipboard: false });
    expect(mockSharingAvailable).not.toHaveBeenCalled();
  });

  it("share sheet present but not available on this device", async () => {
    mockSharingAvailable.mockResolvedValue(false);
    expect((await getShareCapabilities()).shareSheet).toBe(false);
    mockSharingAvailable.mockRejectedValue(new Error("x"));
    expect((await getShareCapabilities()).shareSheet).toBe(false);
  });

  it("a clipboard native module without setStringAsync counts as absent", async () => {
    mockNative.ExpoClipboard = {};
    expect((await getShareCapabilities()).clipboard).toBe(false);
  });
});

describe("copyText", () => {
  it("is false without the clipboard module (every tier-1 build)", async () => {
    expect(await copyText("hi")).toBe(false);
  });

  it("calls the native setStringAsync when present", async () => {
    const setStringAsync = jest.fn().mockResolvedValue(true);
    mockNative.ExpoClipboard = { setStringAsync };
    expect(await copyText("hi")).toBe(true);
    expect(setStringAsync).toHaveBeenCalledWith("hi", {});
  });

  it("is false when the native call rejects", async () => {
    mockNative.ExpoClipboard = { setStringAsync: jest.fn().mockRejectedValue(new Error("x")) };
    expect(await copyText("hi")).toBe(false);
  });
});
