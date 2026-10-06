/**
 * The Motion Rule haptic vocabulary (Adding Flare, jits-pddd.1): each
 * semantic event maps to exactly one expo-haptics call, failures never
 * reject, there is no loss event, and the match-flow name is the same object.
 */
const mockImpact = jest.fn((_s: unknown) => Promise.resolve());
const mockNotify = jest.fn((_t: unknown) => Promise.resolve());
const mockSelect = jest.fn(() => Promise.resolve());
jest.mock("expo-haptics", () => ({
  impactAsync: (s: unknown) => mockImpact(s),
  notificationAsync: (t: unknown) => mockNotify(t),
  selectionAsync: () => mockSelect(),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
  NotificationFeedbackType: { Success: "success", Warning: "warning", Error: "error" },
}));

import { haptics } from "@/lib/motion";
import { __resetHapticGuardForTests, SUCCESS_DEDUPE_MS } from "@/lib/motion/haptics";
import { matchHaptics } from "@/lib/match-flow/use-haptics";

beforeEach(() => {
  __resetHapticGuardForTests();
  mockImpact.mockClear();
  mockNotify.mockClear();
  mockSelect.mockClear();
});

function callsFor(fire: () => unknown) {
  fire();
  return {
    impact: mockImpact.mock.calls.map((c) => c[0]),
    notify: mockNotify.mock.calls.map((c) => c[0]),
    select: mockSelect.mock.calls.length,
  };
}

describe("haptics vocabulary", () => {
  it.each([
    ["press", { impact: ["light"], notify: [], select: 0 }],
    ["accept", { impact: ["medium"], notify: [], select: 0 }],
    ["select", { impact: [], notify: [], select: 1 }],
    ["goLive", { impact: ["light"], notify: [], select: 0 }],
    ["challengeArrived", { impact: [], notify: ["warning"], select: 0 }],
    ["ratingGain", { impact: [], notify: ["success"], select: 0 }],
    ["matchStart", { impact: ["heavy"], notify: [], select: 0 }],
    ["matchEnd", { impact: [], notify: ["success"], select: 0 }],
    ["resultRecorded", { impact: [], notify: ["success"], select: 0 }],
    ["error", { impact: [], notify: ["error"], select: 0 }],
    ["countdownTick", { impact: ["heavy"], notify: [], select: 0 }],
    ["countdownGo", { impact: [], notify: ["success"], select: 0 }],
    ["tapTick", { impact: ["light"], notify: [], select: 0 }],
    ["reelRevealed", { impact: [], notify: ["success"], select: 0 }],
    ["milestone", { impact: [], notify: ["success"], select: 0 }],
    ["timeWarning", { impact: ["medium"], notify: [], select: 0 }],
  ] as const)("%s fires exactly one mapped haptic", (event, expected) => {
    expect(callsFor(() => haptics[event]())).toEqual(expected);
  });

  it("has no loss or draw event (never a haptic on a loss)", () => {
    const names = Object.keys(haptics).map((k) => k.toLowerCase());
    expect(names.some((n) => n.includes("loss") || n.includes("lose") || n.includes("draw"))).toBe(false);
  });

  it("swallows a failing haptic instead of rejecting", async () => {
    mockImpact.mockImplementationOnce(() => Promise.reject(new Error("no engine")));
    await expect(haptics.press()).resolves.toBeUndefined();
    mockSelect.mockImplementationOnce(() => Promise.reject(new Error("no engine")));
    await expect(haptics.select()).resolves.toBeUndefined();
  });

  it("never throws when expo-haptics throws synchronously or is partially mocked", async () => {
    mockImpact.mockImplementationOnce(() => {
      throw new Error("native module missing");
    });
    await expect(haptics.accept()).resolves.toBeUndefined();
    mockNotify.mockImplementationOnce(() => undefined as unknown as Promise<void>);
    await expect(haptics.ratingGain()).resolves.toBeUndefined();
  });

  it("a reel reveal and the first-highlight milestone at once buzz once (shared 500 ms guard)", () => {
    const now = jest.spyOn(Date, "now");
    now.mockReturnValue(10_000);
    void haptics.reelRevealed();
    void haptics.milestone();
    expect(mockNotify).toHaveBeenCalledTimes(1);
    now.mockReturnValue(10_000 + SUCCESS_DEDUPE_MS);
    void haptics.milestone();
    expect(mockNotify).toHaveBeenCalledTimes(2);
    // Other success events are not guarded.
    void haptics.ratingGain();
    expect(mockNotify).toHaveBeenCalledTimes(3);
    now.mockRestore();
  });

  it("keeps matchHaptics as the same vocabulary under its old name", () => {
    expect(matchHaptics).toBe(haptics);
  });
});
