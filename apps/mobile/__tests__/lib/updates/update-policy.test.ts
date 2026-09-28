import {
  UPDATE_CHECK_MIN_INTERVAL_MS,
  UPDATE_NOTICE_MAX_LENGTH,
  decideUpdatePrompt,
  extraFromUpdateManifest,
  isCriticalUpdate,
  isOtaControlEnabled,
  readCriticalIndex,
  readUpdateNotice,
  shouldCheckForUpdate,
} from "@/lib/updates/update-policy";

describe("readCriticalIndex", () => {
  it.each([
    ["undefined", undefined],
    ["null", null],
    ["missing key", {}],
    ["string", { updateCriticalIndex: "3" }],
    ["NaN", { updateCriticalIndex: NaN }],
    ["negative", { updateCriticalIndex: -1 }],
    ["fraction", { updateCriticalIndex: 1.5 }],
    ["Infinity", { updateCriticalIndex: Infinity }],
    ["null value", { updateCriticalIndex: null }],
  ])("%s => 0", (_label, extra) => {
    expect(readCriticalIndex(extra)).toBe(0);
  });

  it("reads valid integers", () => {
    expect(readCriticalIndex({ updateCriticalIndex: 0 })).toBe(0);
    expect(readCriticalIndex({ updateCriticalIndex: 7 })).toBe(7);
  });
});

describe("readUpdateNotice", () => {
  it("returns null for non-strings and blanks", () => {
    expect(readUpdateNotice(undefined)).toBeNull();
    expect(readUpdateNotice({})).toBeNull();
    expect(readUpdateNotice({ updateNotice: 42 })).toBeNull();
    expect(readUpdateNotice({ updateNotice: "  " })).toBeNull();
  });

  it("trims", () => {
    expect(readUpdateNotice({ updateNotice: "  hi " })).toBe("hi");
  });

  it("truncates to the max length", () => {
    const out = readUpdateNotice({ updateNotice: "a".repeat(300) });
    expect(out).toHaveLength(UPDATE_NOTICE_MAX_LENGTH);
    expect(UPDATE_NOTICE_MAX_LENGTH).toBe(280);
  });
});

describe("extraFromUpdateManifest", () => {
  it("is safe on missing/malformed manifests (incl. rollback)", () => {
    expect(extraFromUpdateManifest(undefined)).toBeUndefined();
    expect(extraFromUpdateManifest({})).toBeUndefined();
    expect(extraFromUpdateManifest({ extra: {} })).toBeUndefined();
    expect(extraFromUpdateManifest({ extra: { expoClient: "x" } })).toBeUndefined();
  });

  it("reads a well-formed manifest", () => {
    const extra = extraFromUpdateManifest({
      extra: { expoClient: { extra: { updateCriticalIndex: 2 } } },
    });
    expect(readCriticalIndex(extra)).toBe(2);
  });
});

describe("isCriticalUpdate", () => {
  it("is strictly greater", () => {
    expect(isCriticalUpdate(0, 0)).toBe(false);
    expect(isCriticalUpdate(0, 1)).toBe(true);
    expect(isCriticalUpdate(2, 1)).toBe(false);
  });

  it("enforces a skipped critical through a later normal publish", () => {
    // Running 0; critical publish 1 never installed; later normal publish
    // still carries index 1.
    const running = 0;
    const laterNormalPublish = 1;
    expect(isCriticalUpdate(running, laterNormalPublish)).toBe(true);
  });
});

describe("shouldCheckForUpdate", () => {
  const min = UPDATE_CHECK_MIN_INTERVAL_MS;
  it("blocks while in flight", () => {
    expect(shouldCheckForUpdate({ now: 10 * min, lastCheckAt: null, inFlight: true })).toBe(false);
  });
  it("allows the first check", () => {
    expect(shouldCheckForUpdate({ now: 0, lastCheckAt: null, inFlight: false })).toBe(true);
  });
  it("allows at exactly the interval", () => {
    expect(shouldCheckForUpdate({ now: 1000 + min, lastCheckAt: 1000, inFlight: false })).toBe(true);
  });
  it("blocks one ms short of the interval", () => {
    expect(shouldCheckForUpdate({ now: 999 + min, lastCheckAt: 1000, inFlight: false })).toBe(false);
  });
  it("honours a custom interval", () => {
    expect(
      shouldCheckForUpdate({ now: 50, lastCheckAt: 0, inFlight: false, minIntervalMs: 50 }),
    ).toBe(true);
  });
  it("uses a 15 minute default", () => {
    expect(min).toBe(15 * 60_000);
  });
});

describe("isOtaControlEnabled", () => {
  it.each([
    [false, true, false, true],
    [false, true, true, false],
    [false, false, false, false],
    [false, false, true, false],
    [true, true, false, false],
    [true, true, true, false],
    [true, false, false, false],
    [true, false, true, false],
  ])("isDev=%s updatesEnabled=%s isExpoGo=%s => %s", (isDev, updatesEnabled, isExpoGo, out) => {
    expect(isOtaControlEnabled({ isDev, updatesEnabled, isExpoGo })).toBe(out);
  });
});

describe("decideUpdatePrompt", () => {
  const normal = { updateId: "u1", critical: false };
  const critical = { updateId: "u2", critical: true };
  const rollback = { updateId: null, critical: false };
  const base = { inMatch: false, suppressed: false, dismissedUpdateId: null };

  it.each([
    ["no pending", { ...base, pending: null }, "none"],
    ["normal", { ...base, pending: normal }, "banner"],
    ["critical", { ...base, pending: critical }, "modal"],
    ["rollback", { ...base, pending: rollback }, "banner"],
    ["dismissed normal", { ...base, pending: normal, dismissedUpdateId: "u1" }, "none"],
    ["other id dismissed", { ...base, pending: normal, dismissedUpdateId: "u0" }, "banner"],
    ["critical beats dismissal", { ...base, pending: critical, dismissedUpdateId: "u2" }, "modal"],
    ["inMatch beats critical", { ...base, pending: critical, inMatch: true }, "none"],
    ["inMatch hides banner", { ...base, pending: normal, inMatch: true }, "none"],
    ["suppressed beats critical", { ...base, pending: critical, suppressed: true }, "none"],
    ["suppressed beats banner", { ...base, pending: normal, suppressed: true }, "none"],
    [
      "suppressed + inMatch",
      { ...base, pending: critical, suppressed: true, inMatch: true },
      "none",
    ],
    ["rollback never matches a null dismissal", { ...base, pending: rollback }, "banner"],
  ] as const)("%s", (_label, args, expected) => {
    expect(decideUpdatePrompt(args)).toBe(expected);
  });
});
