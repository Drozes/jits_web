/**
 * AI processing consent (jits-rog5.11, App Review 5.1.2(i)): the cache, the
 * server read, recording only with consent, and the face-off gate.
 */
import { act, renderHook } from "@testing-library/react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
const mockToastInfo = jest.fn();
jest.mock("@/components/ui/toast", () => ({ toast: { info: (m: string) => mockToastInfo(m), success: jest.fn(), error: jest.fn() } }));
const mockApi = { getAiProcessingConsent: jest.fn(), recordAiProcessingConsent: jest.fn() };
jest.mock("@jits/shared/api/moderation", () => ({
  AI_PROCESSING_CONSENT_VERSION: "2026-10-14",
  getAiProcessingConsent: (...a: unknown[]) => mockApi.getAiProcessingConsent(...a),
  recordAiProcessingConsent: (...a: unknown[]) => mockApi.recordAiProcessingConsent(...a),
}));

import {
  __resetAiConsentForTests,
  aiConsentCacheKey,
  giveAiConsent,
  hasAiConsent,
  loadAiConsent,
  useEffectiveRecordingOptIn,
} from "@/lib/moderation/ai-consent";
import { useAiConsentGate } from "@/lib/moderation/use-ai-consent-gate";
import { __resetRecordingOptInForTests, getRecordingOptIn } from "@/lib/match-flow/recording-optin";

const AT = "2026-10-14T12:00:00.000Z";
const CACHED = JSON.stringify({ at: AT, version: "2026-10-14" });

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  __resetAiConsentForTests();
  __resetRecordingOptInForTests(false);
  mockApi.getAiProcessingConsent.mockResolvedValue({ ok: true, data: { consentAt: null, version: null } });
  mockApi.recordAiProcessingConsent.mockResolvedValue({ ok: true, data: AT });
});

describe("loadAiConsent", () => {
  it("not given on the server: no consent", async () => {
    await loadAiConsent("me");
    expect(hasAiConsent()).toBe(false);
  });

  it("given on the server: consent, cached on the device for the next launch", async () => {
    mockApi.getAiProcessingConsent.mockResolvedValue({ ok: true, data: { consentAt: AT, version: "2026-10-14" } });
    await loadAiConsent("me");
    expect(hasAiConsent()).toBe(true);
    expect(await AsyncStorage.getItem(aiConsentCacheKey("me"))).toBe(CACHED);
  });

  it("the device cache answers first, so a consented athlete never sees the gate while the read runs", async () => {
    await AsyncStorage.setItem(aiConsentCacheKey("me"), CACHED);
    mockApi.getAiProcessingConsent.mockReturnValue(new Promise(() => undefined));
    void loadAiConsent("me");
    await act(async () => {});
    expect(hasAiConsent()).toBe(true);
  });

  it("a failed server read keeps the cached answer", async () => {
    await AsyncStorage.setItem(aiConsentCacheKey("me"), CACHED);
    mockApi.getAiProcessingConsent.mockResolvedValue({ ok: false, error: { hint: "unknown", message: "" } });
    await loadAiConsent("me");
    expect(hasAiConsent()).toBe(true);
  });

  it("withdrawn on the server (NULL) beats a cached given, and clears the cache", async () => {
    await AsyncStorage.setItem(aiConsentCacheKey("me"), CACHED);
    await loadAiConsent("me");
    expect(hasAiConsent()).toBe(false);
    expect(await AsyncStorage.getItem(aiConsentCacheKey("me"))).toBeNull();
  });

  it("consent given while a read is in flight is not undone by that read", async () => {
    let resolve: (v: unknown) => void = () => undefined;
    mockApi.getAiProcessingConsent.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    const reading = loadAiConsent("me");
    await act(async () => {});
    await act(async () => {
      await giveAiConsent();
    });
    resolve({ ok: true, data: { consentAt: null, version: null } });
    await reading;
    expect(hasAiConsent()).toBe(true);
  });

  it("consent to an older text version asks again (server and cache)", async () => {
    mockApi.getAiProcessingConsent.mockResolvedValue({ ok: true, data: { consentAt: AT, version: "2025-01-01" } });
    await loadAiConsent("me");
    expect(hasAiConsent()).toBe(false);
    __resetAiConsentForTests();
    await AsyncStorage.setItem(aiConsentCacheKey("me"), JSON.stringify({ at: AT, version: "2025-01-01" }));
    mockApi.getAiProcessingConsent.mockReturnValue(new Promise(() => undefined));
    void loadAiConsent("me");
    await act(async () => {});
    expect(hasAiConsent()).toBe(false);
  });

  it("signing out clears it", async () => {
    mockApi.getAiProcessingConsent.mockResolvedValue({ ok: true, data: { consentAt: AT, version: "2026-10-14" } });
    await loadAiConsent("me");
    await loadAiConsent(null);
    expect(hasAiConsent()).toBe(false);
  });
});

describe("recording needs consent", () => {
  it("a toggle remembered ON reads OFF until consent is given", async () => {
    __resetRecordingOptInForTests(true);
    await loadAiConsent("me");
    const { result } = renderHook(() => useEffectiveRecordingOptIn("me"));
    expect(result.current).toBe(false);
    await act(async () => {
      await giveAiConsent();
    });
    expect(result.current).toBe(true);
    expect(mockApi.recordAiProcessingConsent).toHaveBeenCalledTimes(1);
  });
});

describe("useAiConsentGate (the face-off switch)", () => {
  it("turning on without consent opens Before you film instead of recording", async () => {
    await loadAiConsent("me");
    const { result } = renderHook(() => useAiConsentGate());
    act(() => result.current.onRecordingChange(true));
    expect(result.current.sheet.visible).toBe(true);
    expect(getRecordingOptIn()).toBe(false);
  });

  it("Allow and film records consent, then turns recording on", async () => {
    await loadAiConsent("me");
    const { result } = renderHook(() => useAiConsentGate());
    act(() => result.current.onRecordingChange(true));
    await act(async () => {
      result.current.sheet.onAllow();
    });
    expect(mockApi.recordAiProcessingConsent).toHaveBeenCalledTimes(1);
    expect(result.current.sheet.visible).toBe(false);
    expect(getRecordingOptIn()).toBe(true);
    expect(hasAiConsent()).toBe(true);
  });

  it("a failed save keeps the prompt up with the reason and records nothing", async () => {
    await loadAiConsent("me");
    mockApi.recordAiProcessingConsent.mockResolvedValue({ ok: false, error: { hint: "unknown", message: "" } });
    const { result } = renderHook(() => useAiConsentGate());
    act(() => result.current.onRecordingChange(true));
    await act(async () => {
      result.current.sheet.onAllow();
    });
    expect(result.current.sheet.visible).toBe(true);
    expect(result.current.sheet.error).toBe("Couldn't save your choice. Check your connection and try again.");
    expect(getRecordingOptIn()).toBe(false);
  });

  it("Not now keeps recording off and says the match still counts", async () => {
    await loadAiConsent("me");
    const { result } = renderHook(() => useAiConsentGate());
    act(() => result.current.onRecordingChange(true));
    act(() => result.current.sheet.onNotNow());
    expect(result.current.sheet.visible).toBe(false);
    expect(getRecordingOptIn()).toBe(false);
    expect(mockToastInfo).toHaveBeenCalledWith("No film this time. Your match still counts.");
    expect(mockApi.recordAiProcessingConsent).not.toHaveBeenCalled();
  });

  it("with consent already given, the switch passes straight through (no prompt)", async () => {
    mockApi.getAiProcessingConsent.mockResolvedValue({ ok: true, data: { consentAt: AT, version: "2026-10-14" } });
    await loadAiConsent("me");
    const { result } = renderHook(() => useAiConsentGate());
    act(() => result.current.onRecordingChange(true));
    expect(result.current.sheet.visible).toBe(false);
    expect(getRecordingOptIn()).toBe(true);
    act(() => result.current.onRecordingChange(false));
    expect(getRecordingOptIn()).toBe(false);
  });
});
