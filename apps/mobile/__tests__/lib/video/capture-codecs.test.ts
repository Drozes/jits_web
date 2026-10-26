/**
 * The iOS codec cache (lib/video/capture-codecs.ts; specs/
 * dynamic-capture-bitrate 7.3, AC 5).
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

const mockQuery = jest.fn<Promise<unknown>, []>();
jest.mock("expo-camera", () => ({
  CameraView: { getAvailableVideoCodecsAsync: () => mockQuery() },
}));

import {
  CAPTURE_CODECS_KEY,
  __resetCaptureCodecsForTests,
  cachedCaptureCodecs,
  ensureCaptureCodecs,
  primeCaptureCodecCache,
} from "@/lib/video/capture-codecs";
import { CAPTURE_CODEC_QUERY_TIMEOUT_MS } from "@/lib/video/capture-bitrate";

let restoreOs: { restore: () => void } | null = null;
function onPlatform(os: "ios" | "android") {
  restoreOs?.restore();
  restoreOs = jest.replaceProperty(Platform, "OS", os);
}

beforeEach(async () => {
  __resetCaptureCodecsForTests();
  mockQuery.mockReset();
  await AsyncStorage.clear();
  onPlatform("ios");
});

afterEach(() => {
  restoreOs?.restore();
  restoreOs = null;
  jest.useRealTimers();
});

describe("Android", () => {
  it("never calls the native method, prime is a no-op", async () => {
    onPlatform("android");
    await AsyncStorage.setItem(CAPTURE_CODECS_KEY, JSON.stringify({ os: String(Platform.Version), codecs: ["hvc1"] }));
    await primeCaptureCodecCache();
    await expect(ensureCaptureCodecs()).resolves.toBeNull();
    expect(mockQuery).not.toHaveBeenCalled();
    expect(cachedCaptureCodecs()).toBeNull();
  });
});

describe("ensureCaptureCodecs (iOS)", () => {
  it("success: cached in memory and on disk under this OS version", async () => {
    mockQuery.mockResolvedValue(["hvc1", "avc1"]);
    await expect(ensureCaptureCodecs()).resolves.toEqual(["hvc1", "avc1"]);
    expect(cachedCaptureCodecs()).toEqual(["hvc1", "avc1"]);
    expect(JSON.parse((await AsyncStorage.getItem(CAPTURE_CODECS_KEY))!)).toEqual({
      os: String(Platform.Version),
      codecs: ["hvc1", "avc1"],
    });
    // The next face-off answers from memory.
    await ensureCaptureCodecs();
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["a throw", () => mockQuery.mockRejectedValue(new Error("UnavailabilityError"))],
    ["an empty list (front camera unavailable)", () => mockQuery.mockResolvedValue([])],
    ["a non-list", () => mockQuery.mockResolvedValue("hvc1")],
  ])("%s: null, nothing cached, and asked again next time", async (_name, arrange) => {
    arrange();
    await expect(ensureCaptureCodecs()).resolves.toBeNull();
    expect(cachedCaptureCodecs()).toBeNull();
    await expect(AsyncStorage.getItem(CAPTURE_CODECS_KEY)).resolves.toBeNull();
    await ensureCaptureCodecs();
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it("a timeout: null, nothing cached", async () => {
    jest.useFakeTimers();
    mockQuery.mockReturnValue(new Promise(() => undefined));
    const p = ensureCaptureCodecs();
    await jest.advanceTimersByTimeAsync(CAPTURE_CODEC_QUERY_TIMEOUT_MS);
    await expect(p).resolves.toBeNull();
    expect(cachedCaptureCodecs()).toBeNull();
  });

  it("an answer that arrives after the timeout still fills both caches for the next face-off", async () => {
    jest.useFakeTimers();
    let answer: (v: unknown) => void = () => undefined;
    mockQuery.mockReturnValue(new Promise((res) => (answer = res)));
    const p = ensureCaptureCodecs();
    await jest.advanceTimersByTimeAsync(CAPTURE_CODEC_QUERY_TIMEOUT_MS);
    await expect(p).resolves.toBeNull();
    answer(["hvc1", "avc1"]);
    await jest.advanceTimersByTimeAsync(0);
    expect(cachedCaptureCodecs()).toEqual(["hvc1", "avc1"]);
    expect(JSON.parse((await AsyncStorage.getItem(CAPTURE_CODECS_KEY))!)).toEqual({
      os: String(Platform.Version),
      codecs: ["hvc1", "avc1"],
    });
    await expect(ensureCaptureCodecs()).resolves.toEqual(["hvc1", "avc1"]);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it("concurrent calls share one native call", async () => {
    let answer: (v: unknown) => void = () => undefined;
    mockQuery.mockReturnValue(new Promise((res) => (answer = res)));
    const a = ensureCaptureCodecs();
    const b = ensureCaptureCodecs();
    answer(["avc1"]);
    await expect(Promise.all([a, b])).resolves.toEqual([["avc1"], ["avc1"]]);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it("a failing disk write still caches in memory", async () => {
    mockQuery.mockResolvedValue(["hvc1"]);
    (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error("full"));
    await expect(ensureCaptureCodecs()).resolves.toEqual(["hvc1"]);
    expect(cachedCaptureCodecs()).toEqual(["hvc1"]);
  });
});

describe("primeCaptureCodecCache (iOS)", () => {
  it("loads a list stored under this OS version, with no native call", async () => {
    await AsyncStorage.setItem(CAPTURE_CODECS_KEY, JSON.stringify({ os: String(Platform.Version), codecs: ["hvc1", "avc1"] }));
    await primeCaptureCodecCache();
    expect(cachedCaptureCodecs()).toEqual(["hvc1", "avc1"]);
    await expect(ensureCaptureCodecs()).resolves.toEqual(["hvc1", "avc1"]);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("ignores a list stored under another OS version", async () => {
    await AsyncStorage.setItem(CAPTURE_CODECS_KEY, JSON.stringify({ os: "older-os", codecs: ["hvc1"] }));
    await primeCaptureCodecCache();
    expect(cachedCaptureCodecs()).toBeNull();
  });

  it.each([
    ["corrupt JSON", "{{"],
    ["a non-string list", JSON.stringify({ os: "__OS__", codecs: [1, 2] })],
    ["an empty list", JSON.stringify({ os: "__OS__", codecs: [] })],
    ["null", "null"],
  ])("ignores %s without throwing", async (_name, raw) => {
    await AsyncStorage.setItem(CAPTURE_CODECS_KEY, raw.replace("__OS__", String(Platform.Version)));
    await expect(primeCaptureCodecCache()).resolves.toBeUndefined();
    expect(cachedCaptureCodecs()).toBeNull();
  });

  it("a storage read that throws: no cache, no throw", async () => {
    (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error("disk"));
    await expect(primeCaptureCodecCache()).resolves.toBeUndefined();
    expect(cachedCaptureCodecs()).toBeNull();
  });
});
