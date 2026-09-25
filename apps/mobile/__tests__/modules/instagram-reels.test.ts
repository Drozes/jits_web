/**
 * Tests for the JS face of the local InstagramReels module (jits-s6mi.1).
 *
 * WHAT THESE PROVE: that the wrapper degrades to a named failure instead of
 * throwing when the native half is missing, that it refuses a call it knows
 * cannot succeed BEFORE the native side clobbers the user's pasteboard,
 * that every native error code reaches the caller as a stable JS value with
 * a sentence a person can read, and that Meta's media limits travel to
 * native from one place.
 *
 * WHAT THESE DO NOT PROVE, AND CANNOT: that iOS wrote the
 * `com.instagram.sharedSticker.backgroundVideo` pasteboard item, that
 * `instagram-reels://share` opened a composer with the clip in it, that
 * Android's `grantUriPermission` made the FileProvider URI readable to
 * Instagram, or that any of the validation numbers match what Instagram
 * enforces. The native halves are absent under Jest, no gate on a dev box
 * compiles Swift or Kotlin, and `expo export` does not touch native code.
 * All of that needs a physical device with Instagram installed and a
 * registered Facebook App ID in Live mode (jits-s6mi.8), which is what
 * slice jits-s6mi.6 exists for.
 */

// Marks this file as a MODULE rather than a global script. Without it,
// `mockRequireOptional` and friends land in the global scope and collide with
// the identically-named helpers in `backup-exclusion.test.ts`, which uses the
// same mocking shape. Jest does not care; `tsc --noEmit` does, and that is the
// gate. A `jest.mock` factory cannot be hoisted above a real import, so an
// empty export is the way to declare it.
export {};

const mockRequireOptional = jest.fn();
const mockPlatformOS = { current: "ios" };

// Minimal on purpose: the module under test reads `Platform.OS` and nothing
// else from react-native. A real `Platform` cannot be used here, because
// `jest.isolateModules` hands the re-required module a FRESH react-native,
// so mutating the outer instance would not reach it. Same shape as
// `backup-exclusion.test.ts`.
jest.mock("react-native", () => ({
  Platform: {
    get OS() {
      return mockPlatformOS.current;
    },
  },
}));

jest.mock("expo-modules-core", () => ({
  requireOptionalNativeModule: (...args: unknown[]) => mockRequireOptional(...(args as [])),
}));

function setPlatform(os: string): void {
  mockPlatformOS.current = os;
}

/**
 * Fresh import each time, because the module resolves the native half ONCE
 * at import and that resolution is the thing under test.
 */
function load(native: unknown): typeof import("@/modules/instagram-reels") {
  mockRequireOptional.mockReturnValue(native);
  let mod!: typeof import("@/modules/instagram-reels");
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require("@/modules/instagram-reels");
  });
  return mod;
}

/** A native double that always succeeds, so callers can assert the payload. */
function okNative(outcome: { stickerApplied?: boolean; byteCount?: number } = {}): {
  shareToReels: jest.Mock;
} {
  return {
    shareToReels: jest.fn().mockResolvedValue({
      stickerApplied: outcome.stickerApplied ?? false,
      byteCount: outcome.byteCount ?? 1_000_000,
    }),
  };
}

/** A native double that rejects the way Expo surfaces a coded rejection. */
function rejectingNative(code: string, message = "native said no"): { shareToReels: jest.Mock } {
  const error = Object.assign(new Error(message), { code });
  return { shareToReels: jest.fn().mockRejectedValue(error) };
}

const CLIP = "file:///docs/highlights/clip.mp4";
const APP_ID = "1234567890";

beforeEach(() => {
  jest.clearAllMocks();
  setPlatform("ios");
});

describe("when the native module is absent", () => {
  it("reports itself unsupported rather than throwing at import time", () => {
    // The normal state in Jest, in Expo Go, and in every 0.2.0 binary built
    // before this module existed. `runtimeVersion` policy is `appVersion`,
    // so those binaries accept the same OTA as the build that adds the
    // native half, and a JS bundle can never carry a native module.
    const mod = load(null);
    expect(mod.isReelsShareSupported).toBe(false);
  });

  it("returns a named failure with real copy instead of rejecting", async () => {
    const mod = load(null);
    const result = await mod.shareToReels({ videoUri: CLIP, appId: APP_ID });
    expect(result).toEqual({
      ok: false,
      failure: "module-unavailable",
      message: mod.REELS_FAILURE_MESSAGES["module-unavailable"],
      detail: undefined,
    });
  });

  it("asks for the module by the name both native halves register", () => {
    load(null);
    expect(mockRequireOptional).toHaveBeenCalledWith("InstagramReels");
  });
});

describe("refusals that happen before native is touched", () => {
  it("rejects an empty App ID without opening anything", async () => {
    // Meta has required a registered App ID since January 2023. Reaching
    // native without one would replace the user's pasteboard with a 50 MB
    // clip for a handoff that was never going to work.
    const native = okNative();
    const mod = load(native);
    const result = await mod.shareToReels({ videoUri: CLIP, appId: "   " });
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ failure: "missing-app-id" });
    expect(native.shareToReels).not.toHaveBeenCalled();
  });

  it("rejects an empty video URI without opening anything", async () => {
    const native = okNative();
    const mod = load(native);
    const result = await mod.shareToReels({ videoUri: "", appId: APP_ID });
    expect(result).toMatchObject({ ok: false, failure: "file-not-found" });
    expect(native.shareToReels).not.toHaveBeenCalled();
  });

  it("refuses on a platform with no native half, even if one resolved", async () => {
    // `react-native-web` is in this workspace and Expo Router runs the same
    // JS there. Neither native half exists on web, and the failure should
    // say that rather than blaming the module.
    setPlatform("web");
    const native = okNative();
    const mod = load(native);
    const result = await mod.shareToReels({ videoUri: CLIP, appId: APP_ID });
    expect(result).toMatchObject({ ok: false, failure: "unsupported-platform" });
    expect(native.shareToReels).not.toHaveBeenCalled();
    expect(mod.isReelsShareSupported).toBe(false);
  });
});

describe("the payload handed to native", () => {
  it("carries the clip, the App ID and Meta's limits from ONE place", async () => {
    // The limits travel on every call instead of being constants in Swift
    // AND Kotlin AND TypeScript. Three copies of "3 to 60 seconds" is three
    // chances for one platform to enforce a different window than the other
    // and for nobody to notice until a user hits it.
    const native = okNative();
    const mod = load(native);
    await mod.shareToReels({ videoUri: CLIP, appId: APP_ID });
    expect(native.shareToReels).toHaveBeenCalledWith({
      videoUri: CLIP,
      appId: APP_ID,
      stickerImageUri: undefined,
      minDurationMs: mod.REELS_MIN_DURATION_MS,
      maxDurationMs: mod.REELS_MAX_DURATION_MS,
    });
    // The RECOMMENDED byte ceiling is deliberately NOT sent: native reports
    // the size it measured and this side decides whether to warn, so no
    // code path can turn a recommendation into a refusal.
    expect(native.shareToReels.mock.calls[0][0]).not.toHaveProperty("maxBytes");
  });

  it("passes an optional sticker through", async () => {
    const native = okNative({ stickerApplied: true });
    const mod = load(native);
    const result = await mod.shareToReels({
      videoUri: CLIP,
      appId: APP_ID,
      stickerImageUri: "file:///s.png",
    });
    expect(native.shareToReels).toHaveBeenCalledWith(
      expect.objectContaining({ stickerImageUri: "file:///s.png" }),
    );
    expect(result).toMatchObject({ ok: true, stickerApplied: true });
  });

  it("reports a sticker that was DROPPED rather than pretending it landed", async () => {
    // The sticker is optional on both platforms and both halves silently
    // skip an unreadable one. "Never a silent no-op" has to cover the
    // optional half of the payload too, or a caller that rendered an
    // overlay has no way to learn it never arrived.
    const mod = load(okNative({ stickerApplied: false }));
    const result = await mod.shareToReels({
      videoUri: CLIP,
      appId: APP_ID,
      stickerImageUri: "file:///gone.png",
    });
    expect(result).toMatchObject({ ok: true, stickerApplied: false });
  });

  it("uses Meta's documented Reels window and recommended ceiling", () => {
    // Guards the numbers themselves. 3s is a hard Instagram rejection and
    // 60s is the documented ceiling, so both are REQUIREMENTS. 50 MB is a
    // recommendation and is named as one.
    const mod = load(okNative());
    expect(mod.REELS_MIN_DURATION_MS).toBe(3_000);
    expect(mod.REELS_MAX_DURATION_MS).toBe(60_000);
    expect(mod.REELS_RECOMMENDED_MAX_BYTES).toBe(50 * 1024 * 1024);
  });

  it("reports success only when native resolved", async () => {
    const mod = load(okNative({ byteCount: 12 }));
    await expect(mod.shareToReels({ videoUri: CLIP, appId: APP_ID })).resolves.toEqual({
      ok: true,
      stickerApplied: false,
      byteCount: 12,
      oversize: false,
    });
  });
});

describe("native rejections", () => {
  const cases: Array<[string, string]> = [
    ["ERR_REELS_MISSING_APP_ID", "missing-app-id"],
    ["ERR_REELS_FILE_NOT_FOUND", "file-not-found"],
    ["ERR_REELS_UNREADABLE_VIDEO", "unreadable-video"],
    ["ERR_REELS_VIDEO_TOO_SHORT", "too-short"],
    ["ERR_REELS_VIDEO_TOO_LONG", "too-long"],
    ["ERR_REELS_INSTAGRAM_UNAVAILABLE", "instagram-unavailable"],
    ["ERR_REELS_HANDOFF_FAILED", "handoff-failed"],
  ];

  it.each(cases)("maps %s to %s", async (code, failure) => {
    // Both native halves reject with these exact strings, passed
    // explicitly rather than inferred from a class name, because iOS and
    // Android infer codes by different rules.
    const mod = load(rejectingNative(code));
    const result = await mod.shareToReels({ videoUri: CLIP, appId: APP_ID });
    expect(result).toMatchObject({ ok: false, failure });
  });

  it("never lets a rejection escape as a throw", async () => {
    // The whole point of the Result shape: the caller is a share button and
    // an unhandled rejection there is a crash, not a message.
    const mod = load(rejectingNative("ERR_REELS_VIDEO_TOO_SHORT"));
    await expect(mod.shareToReels({ videoUri: CLIP, appId: APP_ID })).resolves.toMatchObject({
      ok: false,
    });
  });

  it("falls back to `unknown` for a code it has never seen", async () => {
    // An Expo or Instagram-side code this table does not know about, or a
    // bridge teardown. Guessing a specific reason would put wrong copy in
    // front of a user.
    const mod = load(rejectingNative("ERR_SOMETHING_NEW"));
    const result = await mod.shareToReels({ videoUri: CLIP, appId: APP_ID });
    expect(result).toMatchObject({ ok: false, failure: "unknown" });
  });

  it("survives a rejection that carries no code at all", async () => {
    const mod = load({ shareToReels: jest.fn().mockRejectedValue(new Error("bridge gone")) });
    const result = await mod.shareToReels({ videoUri: CLIP, appId: APP_ID });
    expect(result).toMatchObject({ ok: false, failure: "unknown", detail: "bridge gone" });
  });

  it("survives a rejection that is not an Error", async () => {
    const mod = load({ shareToReels: jest.fn().mockRejectedValue("nope") });
    const result = await mod.shareToReels({ videoUri: CLIP, appId: APP_ID });
    expect(result).toMatchObject({ ok: false, failure: "unknown" });
  });

  it("keeps the raw native text out of the user-facing message", async () => {
    // `detail` is for logs. A user must never be shown
    // "ERR_REELS_VIDEO_TOO_LONG: the clip is 74000ms...".
    const mod = load(rejectingNative("ERR_REELS_VIDEO_TOO_LONG", "the clip is 74000ms"));
    const result = await mod.shareToReels({ videoUri: CLIP, appId: APP_ID });
    expect(result).toMatchObject({
      message: mod.REELS_FAILURE_MESSAGES["too-long"],
      detail: "the clip is 74000ms",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).not.toMatch(/ERR_/);
      expect(result.message).not.toMatch(/74000/);
    }
  });
});

describe("user-facing copy", () => {
  it("has a real sentence for every failure, with no error codes in it", () => {
    // The acceptance criterion for this slice is that a rejected clip
    // produces a real message rather than a silent no-op. A missing entry
    // here is how "undefined" ends up in a toast.
    const mod = load(okNative());
    const failures = Object.keys(mod.REELS_FAILURE_MESSAGES);
    expect(failures).toHaveLength(10);
    for (const failure of failures) {
      const copy = mod.REELS_FAILURE_MESSAGES[failure as keyof typeof mod.REELS_FAILURE_MESSAGES];
      expect(copy.length).toBeGreaterThan(10);
      expect(copy).not.toMatch(/ERR_|undefined|null/);
    }
  });
});

describe("the advisory size ceiling", () => {
  it("does not refuse an oversize clip, it flags one", async () => {
    // Meta states "under 50 MB" as a RECOMMENDATION and 3-60s as a
    // REQUIREMENT. Enforcing both makes them mutually inconsistent: a 60s
    // 1080p clip at 8 Mbps is roughly 60 MB, so a clip sitting legally
    // inside the duration window would be refused with copy blaming its
    // length when the real cause is bitrate.
    const mod = load(okNative({ byteCount: 60 * 1024 * 1024 }));
    const result = await mod.shareToReels({ videoUri: CLIP, appId: APP_ID });
    expect(result).toMatchObject({ ok: true, oversize: true, byteCount: 60 * 1024 * 1024 });
  });

  it("leaves a clip at exactly the ceiling alone", async () => {
    const mod = load(okNative({ byteCount: 50 * 1024 * 1024 }));
    await expect(mod.shareToReels({ videoUri: CLIP, appId: APP_ID })).resolves.toMatchObject({
      oversize: false,
    });
  });

  it("has warning copy that reads as advice, not as a failure", () => {
    const mod = load(okNative());
    expect(mod.REELS_OVERSIZE_WARNING.length).toBeGreaterThan(10);
    expect(mod.REELS_OVERSIZE_WARNING).not.toMatch(/ERR_|failed|cannot/i);
  });

  it("survives a native half that predates these fields", async () => {
    // An OTA can land on a binary whose native module resolves but returns
    // the old `undefined`. Reading it blindly would put `NaN` and
    // `undefined` into a result the caller renders.
    const mod = load({ shareToReels: jest.fn().mockResolvedValue(undefined) });
    await expect(mod.shareToReels({ videoUri: CLIP, appId: APP_ID })).resolves.toEqual({
      ok: true,
      stickerApplied: false,
      byteCount: 0,
      oversize: false,
    });
  });
});

describe("the never-throws contract", () => {
  it("survives options with no appId at all", async () => {
    // Live shape, not a hypothetical: the App ID will come from config,
    // which is `string | undefined` at its source, so `options.appId.trim()`
    // on an undefined value is a TypeError in the one function whose whole
    // contract is that it does not throw.
    const native = okNative();
    const mod = load(native);
    const result = await mod.shareToReels({ videoUri: CLIP } as never);
    expect(result).toMatchObject({ ok: false, failure: "missing-app-id" });
    expect(native.shareToReels).not.toHaveBeenCalled();
  });

  it("survives options with no videoUri at all", async () => {
    const mod = load(okNative());
    await expect(mod.shareToReels({ appId: APP_ID } as never)).resolves.toMatchObject({
      ok: false,
      failure: "file-not-found",
    });
  });

  it("survives being called with no options object", async () => {
    // A share button that throws is a crash, not a message.
    const mod = load(okNative());
    await expect(mod.shareToReels(undefined as never)).resolves.toMatchObject({ ok: false });
  });

  it("survives a non-string appId", async () => {
    const mod = load(okNative());
    await expect(
      mod.shareToReels({ videoUri: CLIP, appId: 12345 as never }),
    ).resolves.toMatchObject({ ok: false, failure: "missing-app-id" });
  });
});

describe("isReelsShareSupported", () => {
  it("is true on iOS and Android with the native half present", () => {
    for (const os of ["ios", "android"]) {
      setPlatform(os);
      expect(load(okNative()).isReelsShareSupported).toBe(true);
    }
  });

  it("says nothing about whether Instagram is installed", async () => {
    // Deliberate, and worth a test so nobody wires a "Share to Reels"
    // button to this boolean. Answering that needs `canOpenURL` on iOS and
    // a package query on Android, both of which depend on the declarations
    // in plugins/with-instagram-reels.js, and both belong to slice
    // jits-s6mi.3. Here the module is fully "supported" and the handoff
    // still fails because Instagram is not there.
    const mod = load(rejectingNative("ERR_REELS_INSTAGRAM_UNAVAILABLE"));
    expect(mod.isReelsShareSupported).toBe(true);
    await expect(mod.shareToReels({ videoUri: CLIP, appId: APP_ID })).resolves.toMatchObject({
      failure: "instagram-unavailable",
    });
  });
});
