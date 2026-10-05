/**
 * The header status chip (spec 4.2 to 4.4, AC-H2 to AC-H13): every state's
 * copy through the pure model, then the rendered chip against the real
 * arena store (its guard, cooldown and controller), the popover, the CONFIRM
 * segment and the countdown clock.
 */
import * as React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";

jest.mock("react-native-reanimated", () => require("react-native-reanimated/mock"));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockNavigate = jest.fn();
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({
    navigate: mockNavigate,
    push: mockPush,
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
  }),
}));

// The lobby and the active-match store open realtime channels; the chip only
// reads one number and one match from them.
let mockOnMat: number | null = 12;
const mockOnMatSelf: Array<string | null | undefined> = [];
jest.mock("@/lib/arena/use-lobby-presence", () => ({
  useOnMatCount: (selfId: string | null | undefined) => {
    mockOnMatSelf.push(selfId);
    return mockOnMat;
  },
}));
const mockToastError = jest.fn();
const mockToastInfo = jest.fn();
jest.mock("@/components/ui/toast", () => ({
  toast: {
    error: (...a: unknown[]) => mockToastError(...a),
    info: (...a: unknown[]) => mockToastInfo(...a),
    success: jest.fn(),
  },
}));

let mockToConfirm: { matchId: string; status: "in_progress"; opponentName: string | null } | null =
  null;
jest.mock("@/lib/match-flow/active-match-store", () => ({
  useMatchToConfirm: () => mockToConfirm,
}));

import * as ReactNative from "react-native";
import {
  NavigationContext,
  type NavigationProp,
  type ParamListBase,
} from "@react-navigation/native";
import {
  CHIP_DOUBLE_TAP_GUARD_MS,
  CHIP_PENDING_TEST_ID,
  CHIP_RING_TEST_ID,
  HeaderStatusChip,
} from "@/components/layout/header-status-chip";
import {
  CHIP_HEIGHT,
  CHIP_MAX_FONT_SCALE,
  CHIP_MAX_WIDTH,
  CHIP_TARGET_HEIGHT,
  CONFIRM_COPY_COMPACT,
  CONFIRM_COPY_FULL,
  MIN_NAME_CHARS,
  NARROW_MIN_TEXT_SCALE,
  chipAccessibilityValue,
  chipCopy,
  describeHeaderChip,
  liveSwitchPending,
  estimateChipWidth,
  layoutChip,
  type ChipInput,
} from "@/lib/arena/header-chip-model";
import { formatCountdown, msToNextSecond, spokenCountdown } from "@/lib/arena/fresh-countdown";
import { LIVE_MENU_COPY } from "@/components/layout/live-menu-popover";
import { GO_OFFLINE_FAILED_MESSAGE } from "@/lib/arena/go-live-feedback";
import {
  IDLE_ARENA_STATE,
  PENDING_REVEAL_MS,
  __resetArenaStoreForTests,
  publishArenaSelfId,
  publishArenaState,
  registerArenaController,
  setAppLiveIntent,
  setGoLiveDisplay,
  useHasIncomingReopenSurface,
  useLiveSurface,
  type ArenaController,
  type ArenaState,
} from "@/lib/arena/arena-store";
import {
  ARENA_HREF,
  LIVE_SWITCH_COOLDOWN_MS,
  arenaMatchHref,
} from "@/lib/arena/constants";
import { __resetServerClockForTests } from "@/lib/arena/incoming-challenges";
import { LiveDot } from "@/components/ui/elo-system/live-pill";

const NOW = Date.parse("2026-09-28T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const MIN = 60_000;

function input(over: Partial<ChipInput> = {}): ChipInput {
  return {
    isLive: false,
    phase: "ready",
    direction: null,
    reconnecting: false,
    lastLiveWriteFailed: false,
    onMat: 12,
    outgoing: null,
    incoming: null,
    incomingTucked: false,
    incomingCount: 0,
    confirm: false,
    controllerReady: true,
    now: NOW,
    ...over,
  };
}

const alexIn = (createdMsAgo: number) => ({
  challengerName: "Alex",
  createdAt: ago(createdMsAgo),
  expiresAt: null,
});

beforeEach(() => {
  __resetServerClockForTests();
});

// ---------------------------------------------------------------------------
// Pure model
// ---------------------------------------------------------------------------

describe("round 4 (QA 4): the chip and the Arena bar draw pending from one rule", () => {
  it("for every combination, the chip shows a pending state exactly when liveSwitchPending says so", () => {
    const displays = [null, "hold", "leaving", "optimistic", "going-live", "finding-you", "restore-live", "restore-finding", "recovering", "retry"] as const;
    const phases = ["ready", "cooldown", "saving"] as const;
    const directions = [null, "going-live", "going-offline"] as const;
    const intents = [null, { decided: false, live: false }, { decided: true, live: true }, { decided: true, live: false }];
    let checked = 0;
    for (const display of displays)
      for (const phase of phases)
        for (const direction of directions)
          for (const intent of intents)
            for (const isLive of [false, true]) {
              const m = describeHeaderChip(input({ display, phase, direction, intent, isLive, reconnecting: false }));
              const pending = liveSwitchPending({ intent, display, drawnLive: m.live, phase, direction });
              const chipPending = m.kind === "going-live" || m.kind === "finding-you" || (m.kind === "reconnecting" && !m.live);
              expect({ display, phase, direction, intent, isLive, chipPending }).toEqual({
                display,
                phase,
                direction,
                intent,
                isLive,
                chipPending: pending,
              });
              checked++;
            }
    expect(checked).toBe(720);
  });

  it("the ~100 ms mash frame: no overlay yet, a go-live saving, the chip says GOING LIVE and the bar is pending too", () => {
    const at = { display: null, phase: "saving" as const, direction: "going-live" as const, intent: { decided: true, live: true } };
    expect(describeHeaderChip(input({ ...at, isLive: false })).kind).toBe("going-live");
    expect(liveSwitchPending({ ...at, drawnLive: false })).toBe(true);
  });
});

describe("describeHeaderChip copy (spec 4.3)", () => {
  it("offline shows the lobby count and goes live on tap (AC-H2)", () => {
    const m = describeHeaderChip(input());
    expect(chipCopy(m)).toBe("○ GO LIVE · 12");
    expect(m.action).toBe("go-live");
    expect(m.tone).toBe("neutral");
    expect(m.disabled).toBe(false);
  });

  it("offline and retry are disabled while no Arena controller is registered", () => {
    // The Arena skeleton and the window before ArenaBootstrap mounts: a tap
    // would be a silent no-op, so the chip must not look actionable.
    expect(describeHeaderChip(input({ controllerReady: false })).disabled).toBe(true);
    expect(
      describeHeaderChip(input({ controllerReady: false, lastLiveWriteFailed: true })).disabled,
    ).toBe(true);
    // The copy (and the count) stay as they are.
    expect(chipCopy(describeHeaderChip(input({ controllerReady: false })))).toBe(
      "○ GO LIVE · 12",
    );
  });

  it("offline with the lobby unknown drops the count rather than claiming 0", () => {
    expect(chipCopy(describeHeaderChip(input({ onMat: null })))).toBe("○ GO LIVE");
  });

  it("going live is disabled (AC-H3)", () => {
    const m = describeHeaderChip(input({ phase: "saving", direction: "going-live" }));
    expect(chipCopy(m)).toBe("◌ GOING LIVE");
    expect(m.disabled).toBe(true);
    expect(m.action).toBe("none");
  });

  it("offline during the cooldown takes the tap, which is queued (QA D; was AC-H4 ignored)", () => {
    const m = describeHeaderChip(input({ phase: "cooldown" }));
    expect(chipCopy(m)).toBe("○ GO LIVE · 12");
    expect(m.disabled).toBe(false);
    // Never locked by work in flight either (review round 3): the choice is
    // recorded at once and the server follows.
    expect(describeHeaderChip(input({ phase: "saving" })).disabled).toBe(false);
  });

  it("QA A: the optimistic LIVE chip and RECONNECTING open the live menu when the go-live can be cancelled", () => {
    const live = describeHeaderChip(input({ phase: "saving", display: "optimistic", cancellable: true }));
    expect(live.kind).toBe("live");
    expect(live.disabled).toBe(false);
    const rec = describeHeaderChip(input({ phase: "saving", display: "recovering", cancellable: true }));
    expect(rec.kind).toBe("reconnecting");
    expect(rec.action).toBe("popover");
    expect(rec.disabled).toBe(false);
    // Always open (review round 3), with or without anything to cancel.
    expect(describeHeaderChip(input({ phase: "saving", display: "optimistic" })).disabled).toBe(false);
  });

  it("live shows the count in green and opens the popover (AC-H5)", () => {
    const m = describeHeaderChip(input({ isLive: true }));
    expect(chipCopy(m)).toBe("● LIVE · 12");
    expect(m.tone).toBe("live");
    expect(m.action).toBe("popover");
  });

  it("live with nobody else reads JUST YOU (AC-H5)", () => {
    expect(chipCopy(describeHeaderChip(input({ isLive: true, onMat: 0 })))).toBe(
      "● LIVE · JUST YOU",
    );
  });

  it("an offline choice is drawn at once, while the server still says live (review round 3)", () => {
    const m = describeHeaderChip(
      input({
        isLive: true,
        phase: "saving",
        direction: "going-offline",
        intent: { decided: true, live: false },
      }),
    );
    expect(chipCopy(m)).toBe("○ GO LIVE · 12");
    expect(m.action).toBe("go-live");
    // The way back is one tap away.
    expect(m.disabled).toBe(false);
  });

  it("QA 6: OFFLINE · RETRY takes the tap while a hung write is still in flight", () => {
    const m = describeHeaderChip(
      input({ phase: "saving", display: "retry", intent: { decided: true, live: true } }),
    );
    expect(chipCopy(m)).toBe("○ OFFLINE · RETRY");
    expect(m.disabled).toBe(false);
  });

  it("waiting counts down the outgoing challenge's fresh window (AC-H7)", () => {
    const m = describeHeaderChip(
      input({
        isLive: true,
        outgoing: { opponentName: "Alex", createdAt: ago(MIN + 48_000), expiresAt: null },
      }),
    );
    expect(chipCopy(m)).toBe("● WAITING · ALEX · 8:12");
    expect(m.action).toBe("open-arena");
    expect(m.tone).toBe("live");
  });

  it("waiting returns to the base state at 0:00 (AC-H7)", () => {
    const m = describeHeaderChip(
      input({
        isLive: true,
        outgoing: { opponentName: "Alex", createdAt: ago(10 * MIN), expiresAt: null },
      }),
    );
    expect(chipCopy(m)).toBe("● LIVE · 12");
  });

  it("waiting without a known creation time shows no countdown", () => {
    const m = describeHeaderChip(
      input({ isLive: true, outgoing: { opponentName: "Alex", createdAt: null } }),
    );
    expect(chipCopy(m)).toBe("● WAITING · ALEX");
  });

  it("a challenge tucked with Later reads ! NAME · m:ss with a red border (AC-H8)", () => {
    const m = describeHeaderChip(
      input({
        isLive: true,
        incoming: alexIn(MIN + 19_000),
        incomingTucked: true,
        incomingCount: 1,
      }),
    );
    expect(chipCopy(m)).toBe("! ALEX · 8:41");
    expect(m.tone).toBe("incoming");
    expect(m.action).toBe("reopen-incoming");
  });

  it("a prompt that is up (not tucked) leaves the chip on its base state", () => {
    const m = describeHeaderChip(
      input({ isLive: true, incoming: alexIn(MIN), incomingTucked: false, incomingCount: 1 }),
    );
    expect(chipCopy(m)).toBe("● LIVE · 12");
  });

  it("a tucked challenge still shows while offline (backgrounding keeps it, Q3)", () => {
    const m = describeHeaderChip(
      input({ isLive: false, incoming: alexIn(MIN), incomingTucked: true, incomingCount: 1 }),
    );
    expect(chipCopy(m)).toBe("! ALEX · 9:00");
  });

  it("a lapsed tucked challenge falls back to the base state", () => {
    const m = describeHeaderChip(
      input({ isLive: true, incoming: alexIn(10 * MIN), incomingTucked: true, incomingCount: 1 }),
    );
    expect(chipCopy(m)).toBe("● LIVE · 12");
  });

  it("several incoming read ! N WANT TO ROLL and reopen the sheet (AC-H9)", () => {
    const m = describeHeaderChip(
      input({ isLive: true, incoming: alexIn(MIN), incomingTucked: false, incomingCount: 3 }),
    );
    expect(chipCopy(m)).toBe("! 3 WANT TO ROLL");
    expect(m.tone).toBe("incoming");
    expect(m.action).toBe("reopen-incoming");
  });

  it("incoming outranks waiting, which outranks the base state", () => {
    const both = input({
      isLive: true,
      incoming: alexIn(MIN),
      incomingTucked: true,
      incomingCount: 1,
      outgoing: { opponentName: "Sam", createdAt: ago(MIN) },
      confirm: true,
    });
    expect(chipCopy(describeHeaderChip(both))).toBe("! ALEX · 9:00");
    expect(
      chipCopy(describeHeaderChip({ ...both, incoming: null, incomingCount: 0 })),
    ).toBe("● WAITING · SAM · 9:00");
  });

  it("CONFIRM is appended to live and keeps it green (AC-H10)", () => {
    const m = describeHeaderChip(input({ isLive: true, confirm: true }));
    expect(chipCopy(m)).toBe("● LIVE · 12 ▪ CONFIRM");
    expect(m.tone).toBe("live");
    expect(m.live).toBe(true);
    expect(m.action).toBe("popover");
  });

  it("CONFIRM is appended to offline and keeps it grey (AC-H10)", () => {
    const m = describeHeaderChip(input({ confirm: true }));
    expect(chipCopy(m)).toBe("○ GO LIVE · 12 ▪ CONFIRM");
    expect(m.tone).toBe("neutral");
    expect(m.live).toBe(false);
    expect(m.action).toBe("go-live");
  });

  it("waiting while offline is grey with a hollow ring, never the live styling", () => {
    // An outgoing challenge survives a manual or background go-offline.
    const m = describeHeaderChip(
      input({
        isLive: false,
        outgoing: { opponentName: "Alex", createdAt: ago(MIN + 48_000), expiresAt: null },
      }),
    );
    expect(chipCopy(m)).toBe("○ WAITING · ALEX · 8:12");
    expect(m.kind).toBe("waiting");
    expect(m.tone).toBe("neutral");
    expect(m.glyph).toBe("○");
    expect(m.live).toBe(false);
    expect(chipAccessibilityValue(m)).toEqual({ text: "offline" });
    expect(m.action).toBe("open-arena");
    expect(m.accessibilityLabel).toBe(
      "Live status: waiting for Alex, 8 minutes 12 seconds left. Open Arena",
    );
  });

  it("WAITING on the Arena tab itself has no action and never says Open Arena", () => {
    const m = describeHeaderChip(
      input({
        isLive: true,
        onArena: true,
        outgoing: { opponentName: "Alex", createdAt: ago(MIN + 48_000), expiresAt: null },
      }),
    );
    expect(chipCopy(m)).toBe("● WAITING · ALEX · 8:12");
    expect(m.action).toBe("none");
    expect(m.disabled).toBe(false);
    expect(m.accessibilityLabel).toBe("Live status: waiting for Alex, 8 minutes 12 seconds left");
  });

  it("the accessibilityValue carries live state; labels never repeat it", () => {
    expect(chipAccessibilityValue(describeHeaderChip(input()))).toEqual({ text: "offline" });
    expect(chipAccessibilityValue(describeHeaderChip(input({ isLive: true })))).toEqual({
      text: "live",
    });
    expect(
      chipAccessibilityValue(describeHeaderChip(input({ lastLiveWriteFailed: true }))),
    ).toEqual({ text: "offline" });
    // GOING LIVE says where it is heading; "going live, offline" would not.
    expect(
      chipAccessibilityValue(
        describeHeaderChip(input({ phase: "saving", direction: "going-live" })),
      ),
    ).toBeUndefined();
    const labels = [
      input(),
      input({ onMat: null }),
      input({ isLive: true }),
      input({ isLive: true, onMat: 0 }),
      input({ isLive: true, reconnecting: true }),
      input({ lastLiveWriteFailed: true }),
    ].map((i) => describeHeaderChip(i).accessibilityLabel);
    for (const label of labels) {
      expect(label).not.toMatch(/^Live status: (live|offline)\b/);
      expect(label).not.toMatch(/\boffline\b/);
    }
    expect(describeHeaderChip(input({ onMat: null })).accessibilityLabel).toBe(
      "Live status: Go live",
    );
  });

  it("reconnecting is never red and still opens the popover (AC-H11)", () => {
    const m = describeHeaderChip(input({ isLive: true, reconnecting: true, onMat: null }));
    expect(chipCopy(m)).toBe("◌ RECONNECTING");
    expect(m.tone).toBe("neutral");
    expect(m.action).toBe("popover");
  });

  it("a failed flag write reads OFFLINE · RETRY, never red, and retries (AC-H11)", () => {
    const m = describeHeaderChip(input({ lastLiveWriteFailed: true }));
    expect(chipCopy(m)).toBe("○ OFFLINE · RETRY");
    expect(m.tone).toBe("neutral");
    expect(m.action).toBe("go-live");
    expect(m.disabled).toBe(false);
    // In the cooldown the retry is queued (QA D), so it takes the tap.
    expect(describeHeaderChip(input({ lastLiveWriteFailed: true, phase: "cooldown" })).disabled).toBe(
      false,
    );
  });

  it("a tucked challenge with no known timestamps shows no countdown", () => {
    const m = describeHeaderChip(
      input({
        isLive: true,
        incoming: { challengerName: "Alex", createdAt: null, expiresAt: null },
        incomingTucked: true,
        incomingCount: 1,
      }),
    );
    expect(chipCopy(m)).toBe("! ALEX");
    expect(m.tail).toBeNull();
    expect(m.accessibilityLabel).toBe("Live status: Alex wants to roll. Open challenge");
  });

  it("several incoming suppress CONFIRM (it goes on base states only)", () => {
    const m = describeHeaderChip(
      input({ isLive: true, incoming: alexIn(MIN), incomingCount: 3, confirm: true }),
    );
    expect(m.kind).toBe("incoming-many");
    expect(m.confirm).toBe(false);
    expect(chipCopy(m)).toBe("! 3 WANT TO ROLL");
  });

  it("an incoming count without an incoming challenge keeps the base state", () => {
    const m = describeHeaderChip(input({ isLive: true, incoming: null, incomingCount: 3 }));
    expect(chipCopy(m)).toBe("● LIVE · 12");
    expect(m.kind).toBe("live");
  });

  it("caps a huge lobby at 99+", () => {
    expect(chipCopy(describeHeaderChip(input({ onMat: 250 })))).toBe("○ GO LIVE · 99+");
  });

  it("no state's accessibility label is Go live or Go offline (AC-H13)", () => {
    const states: ChipInput[] = [
      input(),
      input({ phase: "saving", direction: "going-live" }),
      input({ isLive: true }),
      input({ isLive: true, onMat: 0 }),
      input({ isLive: true, outgoing: { opponentName: "Alex", createdAt: ago(MIN) } }),
      input({ isLive: true, incoming: alexIn(MIN), incomingTucked: true, incomingCount: 1 }),
      input({ isLive: true, incoming: alexIn(MIN), incomingCount: 3 }),
      input({ isLive: true, reconnecting: true }),
      input({ lastLiveWriteFailed: true }),
      input({ confirm: true }),
    ];
    for (const s of states) {
      const label = describeHeaderChip(s).accessibilityLabel;
      expect(label.toLowerCase()).not.toBe("go live");
      expect(label.toLowerCase()).not.toBe("go offline");
      expect(label.startsWith("Live status:")).toBe(true);
      // The harness's "Waiting for <name>" StaticText must stay unique too.
      expect(label).not.toMatch(/^Waiting for /);
    }
  });

  it("spells the state out for a screen reader", () => {
    expect(describeHeaderChip(input()).accessibilityLabel).toBe(
      "Live status: 12 on the mat. Go live",
    );
    expect(describeHeaderChip(input({ isLive: true, onMat: 0 })).accessibilityLabel).toBe(
      "Live status: Just you on the mat. Open live menu",
    );
    expect(
      describeHeaderChip(
        input({ isLive: true, incoming: alexIn(MIN + 19_000), incomingTucked: true, incomingCount: 1 }),
      ).accessibilityLabel,
    ).toBe("Live status: Alex wants to roll, 8 minutes 41 seconds left. Open challenge");
  });
});

describe("chip width budget (spec 4.2, AC-H12)", () => {
  const baseStates: Array<[string, ChipInput]> = [
    ["offline", input()],
    ["offline 99+", input({ onMat: 250 })],
    ["going live", input({ phase: "saving", direction: "going-live" })],
    ["live", input({ isLive: true })],
    ["live 99+", input({ isLive: true, onMat: 250 })],
    ["live just you", input({ isLive: true, onMat: 0 })],
    ["reconnecting", input({ isLive: true, reconnecting: true })],
    ["retry", input({ lastLiveWriteFailed: true })],
  ];

  it("the cap is 160pt: the smallest that fits the spec's own AC-H10 copy at 1x", () => {
    // Spec 4.2 says "about 150pt"; `○ GO LIVE · 12 ▪ CONFIRM` needs 157pt.
    expect(CHIP_MAX_WIDTH).toBe(160);
    const offline = describeHeaderChip(input({ confirm: true }));
    expect(estimateChipWidth(offline, 1, CONFIRM_COPY_FULL)).toBeGreaterThan(150);
    expect(estimateChipWidth(offline, 1, CONFIRM_COPY_FULL)).toBeLessThanOrEqual(CHIP_MAX_WIDTH);
  });

  const fitted = (m: ReturnType<typeof describeHeaderChip>, scale: number) => {
    const l = layoutChip(m, scale);
    return estimateChipWidth(m, l.textScale, l.confirmCopy, MIN_NAME_CHARS);
  };

  it.each([0.85, 1, 1.15, CHIP_MAX_FONT_SCALE, 3.1])(
    "every base state fits, CONFIRM included, at font scale %s",
    (scale) => {
      for (const [, s] of baseStates) {
        for (const confirm of [false, true]) {
          const m = describeHeaderChip({ ...s, confirm });
          const l = layoutChip(m, scale);
          expect(l.confirmCopy === null).toBe(!confirm);
          expect(fitted(m, scale)).toBeLessThanOrEqual(CHIP_MAX_WIDTH);
          // Never drawn above the system size nor the 1.3x cap.
          expect(l.textScale).toBeLessThanOrEqual(Math.min(scale, CHIP_MAX_FONT_SCALE));
        }
      }
    },
  );

  it("at 1x every state fits without shrinking its text", () => {
    for (const [, s] of baseStates) {
      for (const confirm of [false, true]) {
        expect(layoutChip(describeHeaderChip({ ...s, confirm }), 1).textScale).toBe(1);
      }
    }
  });

  it("keeps the full copy, CONFIRM word included, at 1x for the spec's examples", () => {
    const live = describeHeaderChip(input({ isLive: true, confirm: true }));
    const offline = describeHeaderChip(input({ confirm: true }));
    expect(chipCopy(live)).toBe("● LIVE · 12 ▪ CONFIRM");
    expect(chipCopy(offline)).toBe("○ GO LIVE · 12 ▪ CONFIRM");
    expect(layoutChip(live, 1)).toEqual({ confirmCopy: CONFIRM_COPY_FULL, textScale: 1 });
    expect(layoutChip(offline, 1)).toEqual({ confirmCopy: CONFIRM_COPY_FULL, textScale: 1 });
  });

  it("never drops the count: CONFIRM shortens to its marker first (spec 4.2, AC-H12)", () => {
    // The copy has no shorter form: the count, JUST YOU and 99+ always read.
    for (const [, s] of baseStates) {
      const m = describeHeaderChip({ ...s, confirm: true });
      expect(m).not.toHaveProperty("leadCompact");
    }
    const at = (over: Partial<ChipInput>, scale: number) =>
      layoutChip(describeHeaderChip(input({ ...over, confirm: true })), scale);
    // At 1x, JUST YOU, 99+ and RETRY keep their copy; only the word shortens.
    expect(at({ isLive: true, onMat: 0 }, 1)).toEqual({
      confirmCopy: CONFIRM_COPY_COMPACT,
      textScale: 1,
    });
    expect(at({ onMat: 250 }, 1)).toEqual({ confirmCopy: CONFIRM_COPY_COMPACT, textScale: 1 });
    expect(at({ lastLiveWriteFailed: true }, 1)).toEqual({
      confirmCopy: CONFIRM_COPY_COMPACT,
      textScale: 1,
    });
    // At the 1.3x cap, `● LIVE · 12 ▪` still fits at full size.
    expect(at({ isLive: true }, CHIP_MAX_FONT_SCALE)).toEqual({
      confirmCopy: CONFIRM_COPY_COMPACT,
      textScale: CHIP_MAX_FONT_SCALE,
    });
    expect(at({}, CHIP_MAX_FONT_SCALE)).toEqual({
      confirmCopy: CONFIRM_COPY_COMPACT,
      textScale: CHIP_MAX_FONT_SCALE,
    });
  });

  it("only then steps the text scale down, never below 1x (AC-H12)", () => {
    const justYou = describeHeaderChip(input({ isLive: true, onMat: 0, confirm: true }));
    const l = layoutChip(justYou, CHIP_MAX_FONT_SCALE);
    expect(l.confirmCopy).toBe(CONFIRM_COPY_COMPACT);
    expect(l.textScale).toBeLessThan(CHIP_MAX_FONT_SCALE);
    expect(l.textScale).toBeGreaterThanOrEqual(1);
    // The largest step that fits: one step up would not.
    expect(estimateChipWidth(justYou, l.textScale, l.confirmCopy)).toBeLessThanOrEqual(
      CHIP_MAX_WIDTH,
    );
    expect(estimateChipWidth(justYou, l.textScale + 0.05, l.confirmCopy)).toBeGreaterThan(
      CHIP_MAX_WIDTH,
    );
  });

  it("a system scale under 1x is drawn as is", () => {
    const m = describeHeaderChip(input({ isLive: true, confirm: true }));
    expect(layoutChip(m, 0.85)).toEqual({ confirmCopy: CONFIRM_COPY_FULL, textScale: 0.85 });
  });

  it("the ▪ marker is still charged a full 44pt target", () => {
    expect(CONFIRM_COPY_COMPACT).toBe("▪");
    const going = describeHeaderChip(input({ phase: "saving", direction: "going-live", confirm: true }));
    expect(layoutChip(going, 1).confirmCopy).toBe(CONFIRM_COPY_FULL);
    expect(layoutChip(going, CHIP_MAX_FONT_SCALE).confirmCopy).toBe(CONFIRM_COPY_COMPACT);
    expect(
      estimateChipWidth(going, CHIP_MAX_FONT_SCALE, CONFIRM_COPY_COMPACT) -
        estimateChipWidth(going, CHIP_MAX_FONT_SCALE, null),
    ).toBeGreaterThanOrEqual(44 - 8);
  });

  it("clamps the font scale at the 1.3x cap", () => {
    const m = describeHeaderChip(input({ confirm: true }));
    expect(estimateChipWidth(m, 3.1, CONFIRM_COPY_COMPACT)).toBe(
      estimateChipWidth(m, CHIP_MAX_FONT_SCALE, CONFIRM_COPY_COMPACT),
    );
    expect(estimateChipWidth(m, 1, null)).toBeLessThan(
      estimateChipWidth(m, CHIP_MAX_FONT_SCALE, null),
    );
    expect(layoutChip(describeHeaderChip(input()), 3.1).textScale).toBe(CHIP_MAX_FONT_SCALE);
  });

  it("a name keeps at least MIN_NAME_CHARS visible at the 1.3x cap (AC-H12)", () => {
    const longName = "Alexandria Montgomery-Featherstonehaugh";
    const states = [
      input({ isLive: true, outgoing: { opponentName: longName, createdAt: ago(MIN) } }),
      input({
        isLive: true,
        incoming: { ...alexIn(MIN), challengerName: longName },
        incomingTucked: true,
        incomingCount: 1,
      }),
    ];
    expect(MIN_NAME_CHARS).toBeGreaterThanOrEqual(3);
    for (const s of states) {
      expect(fitted(describeHeaderChip(s), CHIP_MAX_FONT_SCALE)).toBeLessThanOrEqual(
        CHIP_MAX_WIDTH,
      );
    }
  });

  it("WAITING keeps its separators at every size (AC-H7)", () => {
    const m = describeHeaderChip(
      input({ isLive: true, outgoing: { opponentName: "Alex", createdAt: ago(MIN + 48_000) } }),
    );
    expect(chipCopy(m)).toBe("● WAITING · ALEX · 8:12");
    expect(m.lead).toBe("WAITING · ");
    expect(m.tail).toBe(" · 8:12");
    expect(layoutChip(m, 1)).toEqual({ confirmCopy: null, textScale: 1 });
    // At the cap the name ellipsizes and the text steps down; the copy holds.
    const l = layoutChip(m, CHIP_MAX_FONT_SCALE);
    expect(l.textScale).toBeGreaterThanOrEqual(1);
    expect(fitted(m, CHIP_MAX_FONT_SCALE)).toBeLessThanOrEqual(CHIP_MAX_WIDTH);
  });

  it("several incoming fit at the cap even at 99+", () => {
    const m = describeHeaderChip(input({ isLive: true, incoming: alexIn(MIN), incomingCount: 250 }));
    expect(fitted(m, CHIP_MAX_FONT_SCALE)).toBeLessThanOrEqual(CHIP_MAX_WIDTH);
  });
});

describe("chip width on a narrow header (spec 4.2, AC-H12)", () => {
  // The width the header leaves the chip: screen width, minus the 16pt side
  // gutters, the 12pt title gap, the wordmark (about 100pt: the widest
  // left-hand item), the 8pt chip-to-bell gap and the 32pt bell.
  const slotFor = (screen: number) => screen - 32 - 12 - 100 - 8 - 32;
  const long = "Alexandria Montgomery-Featherstonehaugh";
  const states: Array<[string, ChipInput]> = [
    ["offline + confirm", input({ confirm: true })],
    ["offline 99+ + confirm", input({ onMat: 250, confirm: true })],
    ["live just you + confirm", input({ isLive: true, onMat: 0, confirm: true })],
    ["retry + confirm", input({ lastLiveWriteFailed: true, confirm: true })],
    [
      "waiting (live)",
      input({ isLive: true, outgoing: { opponentName: long, createdAt: ago(MIN) } }),
    ],
    ["waiting (offline)", input({ outgoing: { opponentName: long, createdAt: ago(MIN) } })],
    ["tucked", input({ incoming: { ...alexIn(MIN), challengerName: long }, incomingTucked: true, incomingCount: 1 })],
    ["several", input({ incoming: alexIn(MIN), incomingCount: 250 })],
  ];

  it.each([320, 375])(
    "at a %spt-wide screen and the 1.3x cap, every state fits with the count and countdown whole",
    (screen) => {
      const slot = slotFor(screen);
      for (const [, s] of states) {
        const m = describeHeaderChip(s);
        const l = layoutChip(m, CHIP_MAX_FONT_SCALE, slot);
        expect(l.textScale).toBeGreaterThanOrEqual(
          screen === 320 ? NARROW_MIN_TEXT_SCALE : 1,
        );
        // Lead and tail in full; the name down to a lone ellipsis at worst.
        expect(estimateChipWidth(m, l.textScale, l.confirmCopy, 1)).toBeLessThanOrEqual(
          Math.min(slot, CHIP_MAX_WIDTH),
        );
      }
    },
  );

  it("plans against the measured width, not the fixed cap", () => {
    const m = describeHeaderChip(input({ confirm: true }));
    // 160pt fits the full CONFIRM word at 1x; a 140pt slot does not.
    expect(layoutChip(m, 1, 200)).toEqual({ confirmCopy: CONFIRM_COPY_FULL, textScale: 1 });
    expect(layoutChip(m, 1, 140)).toEqual({ confirmCopy: CONFIRM_COPY_COMPACT, textScale: 1 });
    // A wider slot never lifts the 160pt cap; a bogus width falls back to it.
    expect(layoutChip(m, 1, 1000)).toEqual(layoutChip(m, 1));
    expect(layoutChip(m, 1, Number.NaN)).toEqual(layoutChip(m, 1));
    expect(layoutChip(m, 1, 0)).toEqual(layoutChip(m, 1));
  });
});

describe("countdown formatting", () => {
  it("rounds up to whole seconds, so 0:00 only shows once it has lapsed", () => {
    expect(formatCountdown(492_000)).toBe("8:12");
    expect(formatCountdown(491_001)).toBe("8:12");
    expect(formatCountdown(1)).toBe("0:01");
    expect(formatCountdown(0)).toBe("0:00");
    expect(formatCountdown(-5)).toBe("0:00");
  });

  it("ticks on the countdown's own second boundaries", () => {
    expect(msToNextSecond(491_500)).toBe(500);
    expect(msToNextSecond(492_000)).toBe(1000);
    expect(msToNextSecond(1)).toBe(1);
  });

  it("speaks minutes and seconds", () => {
    expect(spokenCountdown(61_000)).toBe("1 minute 1 second");
    expect(spokenCountdown(120_000)).toBe("2 minutes");
    expect(spokenCountdown(0)).toBe("0 seconds");
  });
});

// ---------------------------------------------------------------------------
// Rendered chip
// ---------------------------------------------------------------------------

function controller(over: Partial<ArenaController> = {}): ArenaController {
  return {
    toggle: jest.fn(async () => {}),
    goOffline: jest.fn(async () => true),
    goLive: jest.fn(async () => true),
    sendChallenge: jest.fn(async () => {}),
    cancelOutgoing: jest.fn(async () => {}),
    clearCap: jest.fn(),
    tuckIncoming: jest.fn(),
    reopenIncoming: jest.fn(),
    ...over,
  };
}

function setArena(over: Partial<ArenaState>) {
  act(() => {
    publishArenaState({ ...IDLE_ARENA_STATE, ...over });
  });
}

function incomingState(createdMsAgo: number, over: Partial<ArenaState> = {}): Partial<ArenaState> {
  return {
    isLive: true,
    incoming: {
      challengeId: "c1",
      challengerId: "a2",
      challengerName: "Alexandria Montgomery-Featherstonehaugh",
      challengerElo: 1500,
      challengerWeight: 80,
      createdAt: new Date(Date.now() - createdMsAgo).toISOString(),
      expiresAt: null,
    },
    incomingTucked: true,
    incomingCount: 1,
    ...over,
  };
}

/** Sets the system text size (Dynamic Type) and returns an undo. */
function setFontScale(fontScale: number): () => void {
  const window = ReactNative.Dimensions.get("window");
  const screen = ReactNative.Dimensions.get("screen");
  ReactNative.Dimensions.set({ window: { ...window, fontScale }, screen });
  return () => act(() => ReactNative.Dimensions.set({ window, screen }));
}

/** All the Text under the chip, joined in order. */
/**
 * The chip's drawn copy. The offline ring is a View (the bundled font has no
 * U+25CB), so it reads back as a leading `○` when it is drawn.
 */
function chipText(getByTestId: (id: string) => { findAll: Function }): string {
  const root = getByTestId("header-status-chip");
  const ring = (root.findAll(
    (n: { props: { testID?: unknown } }) => n.props.testID === CHIP_RING_TEST_ID,
  ) as unknown[]).length > 0;
  const text = (root.findAll((n: { type: unknown }) => n.type === "Text") as Array<{
    props: { children: unknown };
  }>)
    .map((n) => String(n.props.children))
    .join("");
  return ring ? `○${text}` : text;
}

describe("HeaderStatusChip", () => {
  let ctl: ArenaController;
  let restoreScale: (() => void) | null = null;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
    jest.clearAllMocks();
    __resetArenaStoreForTests();
    mockOnMat = 12;
    mockOnMatSelf.length = 0;
    mockToConfirm = null;
    ctl = controller();
    registerArenaController(ctl);
  });

  afterEach(() => {
    restoreScale?.();
    restoreScale = null;
    jest.useRealTimers();
  });

  it("offline: renders GO LIVE · 12 and one tap calls goLive exactly once (AC-H2)", async () => {
    const { getByTestId } = render(<HeaderStatusChip />);
    expect(chipText(getByTestId)).toBe("○GO LIVE · 12");

    await act(async () => {
      fireEvent.press(getByTestId("header-status-chip"));
    });
    expect(ctl.goLive).toHaveBeenCalledTimes(1);
    expect(ctl.toggle).not.toHaveBeenCalled();
  });

  it("offline: the hollow ring is a View with the ink-3 border, never a `○` Text", () => {
    const { getByTestId } = render(<HeaderStatusChip />);
    const root = getByTestId("header-status-chip");
    const texts = (root.findAll((n: { type: unknown }) => n.type === "Text") as Array<{
      props: { children: unknown };
    }>).map((n) => String(n.props.children));
    expect(texts.some((t) => t.includes("○"))).toBe(false);
    const ring = getByTestId(CHIP_RING_TEST_ID);
    expect(String(ring.props.className)).toContain("border-ink-3");
    expect(ring.props.style).toEqual(expect.objectContaining({ width: 6, height: 6 }));
  });

  it("registers as the surface that reopens a tucked challenge while mounted (AC-S4)", () => {
    let canReopen: boolean | null = null;
    function Probe() {
      canReopen = useHasIncomingReopenSurface();
      return null;
    }
    const probe = render(<Probe />);
    expect(canReopen).toBe(false);

    const chip = render(<HeaderStatusChip />);
    expect(canReopen).toBe(true);

    // A second tab root mounting before the first unmounts never reads zero.
    const other = render(<HeaderStatusChip />);
    chip.unmount();
    expect(canReopen).toBe(true);

    other.unmount();
    expect(canReopen).toBe(false);
    probe.unmount();
  });

  it("a chip blurred by a pushed screen stops counting as a reopen surface; refocus re-registers (AC-S4)", () => {
    const listeners: Record<string, Array<() => void>> = { focus: [], blur: [] };
    let focused = true;
    const navigation: Pick<NavigationProp<ParamListBase>, "isFocused" | "addListener"> = {
      isFocused: () => focused,
      addListener: ((e: "focus" | "blur", cb: () => void) => {
        listeners[e].push(cb);
        return () => {
          listeners[e] = listeners[e].filter((f) => f !== cb);
        };
      }) as NavigationProp<ParamListBase>["addListener"],
    };
    let canReopen: boolean | null = null;
    function Probe() {
      canReopen = useHasIncomingReopenSurface();
      return null;
    }
    const probe = render(<Probe />);
    const chip = render(
      <NavigationContext.Provider value={navigation as unknown as NavigationProp<ParamListBase>}>
        <HeaderStatusChip />
      </NavigationContext.Provider>,
    );
    expect(canReopen).toBe(true);

    // athlete/[id] pushed over (tabs): the tab root stays mounted but blurs.
    act(() => {
      focused = false;
      listeners.blur.forEach((f) => f());
    });
    expect(canReopen).toBe(false);

    act(() => {
      focused = true;
      listeners.focus.forEach((f) => f());
    });
    expect(canReopen).toBe(true);

    chip.unmount();
    expect(canReopen).toBe(false);
    probe.unmount();
  });

  it("a chip mounted on an unfocused screen never registers (AC-S4)", () => {
    const navigation: Pick<NavigationProp<ParamListBase>, "isFocused" | "addListener"> = {
      isFocused: () => false,
      addListener: (() => () => undefined) as unknown as NavigationProp<ParamListBase>["addListener"],
    };
    let canReopen: boolean | null = null;
    function Probe() {
      canReopen = useHasIncomingReopenSurface();
      return null;
    }
    const probe = render(<Probe />);
    const chip = render(
      <NavigationContext.Provider value={navigation as unknown as NavigationProp<ParamListBase>}>
        <HeaderStatusChip />
      </NavigationContext.Provider>,
    );
    expect(canReopen).toBe(false);
    chip.unmount();
    probe.unmount();
  });

  it("with no Arena controller registered the chip is disabled, not a silent no-op", () => {
    __resetArenaStoreForTests();
    const { getByTestId } = render(<HeaderStatusChip />);
    const chip = getByTestId("header-status-chip");
    expect(chip.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
    expect(chipText(getByTestId)).toBe("○GO LIVE · 12");

    // The owner mounting re-enables it without any other store change.
    const late = controller();
    act(() => {
      registerArenaController(late);
    });
    expect(getByTestId("header-status-chip").props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: false }),
    );
  });

  it("round 5 (cosmetic): the end of a superseded attempt, a pending ring still set while the write has landed: chip and bar both read LIVE, from one snapshot", () => {
    let surface: { drawnLive: boolean; pending: boolean } | null = null;
    function Bar() {
      surface = useLiveSurface();
      return null;
    }
    const { getByTestId } = render(
      <>
        <HeaderStatusChip />
        <Bar />
      </>,
    );
    act(() => setGoLiveDisplay("going-live"));
    expect(chipText(getByTestId)).toBe("GOING LIVE");
    expect(surface).toMatchObject({ drawnLive: false, pending: true });
    // The overtaken attempt's write lands before the driver clears the ring.
    setArena({ isLive: true });
    expect(chipText(getByTestId)).toMatch(/^LIVE/);
    expect(surface).toMatchObject({ drawnLive: true, pending: false });
  });

  it("round 6 (QA cosmetic): a restore or adoption finding a fix: the chip reads FINDING YOU and the bar shows LIVE pending, from one snapshot", () => {
    let surface: { drawnLive: boolean; pending: boolean } | null = null;
    function Bar() {
      surface = useLiveSurface();
      return null;
    }
    const { getByTestId } = render(
      <>
        <HeaderStatusChip />
        <Bar />
      </>,
    );
    // No choice made yet (a foreground restore), then an adoption (the app
    // decided live).
    act(() => setGoLiveDisplay("restore-finding"));
    expect(chipText(getByTestId)).toBe("FINDING YOU");
    expect(surface).toMatchObject({ drawnLive: false, pending: true });
    act(() => setAppLiveIntent(true));
    expect(chipText(getByTestId)).toBe("FINDING YOU");
    expect(surface).toMatchObject({ drawnLive: false, pending: true });
  });

  it("round 4: a second tap within 300 ms of a go-live tap never opens the live menu; later it does", async () => {
    // The go-live lands at once: the chip turns LIVE under the finger.
    const { getByTestId, queryByTestId } = render(<HeaderStatusChip />);
    await act(async () => {
      fireEvent.press(getByTestId("header-status-chip"));
    });
    expect(ctl.goLive).toHaveBeenCalledTimes(1);
    act(() => setArena({ isLive: true }));
    act(() => {
      jest.advanceTimersByTime(CHIP_DOUBLE_TAP_GUARD_MS - 50);
    });
    fireEvent.press(getByTestId("header-status-chip"));
    expect(queryByTestId("live-menu")).toBeNull();
    act(() => {
      jest.advanceTimersByTime(60);
    });
    fireEvent.press(getByTestId("header-status-chip"));
    expect(getByTestId("live-menu")).toBeTruthy();
  });

  it("a go-live that throws does not surface an unhandled rejection", async () => {
    __resetArenaStoreForTests();
    const boom = controller({ goLive: jest.fn(async () => Promise.reject(new Error("boom"))) });
    registerArenaController(boom);
    const unhandled = jest.fn();
    process.on("unhandledRejection", unhandled);
    try {
      const { getByTestId } = render(<HeaderStatusChip />);
      await act(async () => {
        fireEvent.press(getByTestId("header-status-chip"));
      });
      await act(async () => {
        await Promise.resolve();
      });
      expect(boom.goLive).toHaveBeenCalledTimes(1);
    } finally {
      process.off("unhandledRejection", unhandled);
    }
    expect(unhandled).not.toHaveBeenCalled();
  });

  it("excludes self from the count: the lobby is read for the owner's athlete id", () => {
    act(() => publishArenaSelfId("me"));
    render(<HeaderStatusChip />);
    expect(mockOnMatSelf[mockOnMatSelf.length - 1]).toBe("me");
  });

  it("a second tap within the 2s cooldown is ignored, and works after it (AC-H4)", async () => {
    const { getByTestId } = render(<HeaderStatusChip />);
    await act(async () => {
      fireEvent.press(getByTestId("header-status-chip"));
    });
    expect(ctl.goLive).toHaveBeenCalledTimes(1);

    // Still offline (say the attempt did not stick): the chip is locked.
    expect(getByTestId("header-status-chip").props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );
    await act(async () => {
      fireEvent.press(getByTestId("header-status-chip"));
    });
    expect(ctl.goLive).toHaveBeenCalledTimes(1);

    act(() => {
      jest.advanceTimersByTime(LIVE_SWITCH_COOLDOWN_MS);
    });
    await act(async () => {
      fireEvent.press(getByTestId("header-status-chip"));
    });
    expect(ctl.goLive).toHaveBeenCalledTimes(2);
  });

  it("while saving it reads GOING LIVE with the pending pulse and a tap does nothing (AC-H3, live location fixes 4.2)", async () => {
    setArena({ isSaving: true });
    const { getByTestId, queryByTestId } = render(<HeaderStatusChip />);
    // The pulse is drawn as a view in the glyph slot, not the static text glyph.
    expect(chipText(getByTestId)).toBe("GOING LIVE");
    expect(getByTestId(CHIP_PENDING_TEST_ID, { includeHiddenElements: true })).toBeTruthy();
    expect(queryByTestId(CHIP_RING_TEST_ID)).toBeNull();
    await act(async () => {
      fireEvent.press(getByTestId("header-status-chip"));
    });
    expect(ctl.goLive).not.toHaveBeenCalled();
    expect(ctl.toggle).not.toHaveBeenCalled();
  });

  it("live: green, pulsing dot, 10% fill; tap opens the popover (AC-H5, AC-H6)", async () => {
    setArena({ isLive: true });
    const { getByTestId, getByText, getByLabelText, queryByTestId } = render(<HeaderStatusChip />);
    expect(chipText(getByTestId)).toBe("LIVE · 12");
    expect(getByTestId("header-status-chip-fill")).toBeTruthy();
    expect(getByTestId("header-status-chip").props.accessibilityValue).toEqual({ text: "live" });
    expect(queryByTestId("live-menu")).toBeNull();

    fireEvent.press(getByTestId("header-status-chip"));
    expect(getByTestId("live-menu")).toBeTruthy();
    expect(getByText(LIVE_MENU_COPY)).toBeTruthy();
    expect(LIVE_MENU_COPY).toBe(
      "Leaving the app takes you offline. Your screen stays on while you're live.",
    );
    expect(getByText("Open Arena")).toBeTruthy();
    expect(getByText("Go offline")).toBeTruthy();
    // Distinct from the Arena toggle's exact "Go offline" (harness contract).
    expect(getByLabelText("Live menu: go offline")).toBeTruthy();
    expect(getByLabelText("Live menu: open Arena")).toBeTruthy();
  });

  it("popover: Go offline takes the athlete offline and closes (AC-H6)", async () => {
    setArena({ isLive: true });
    const { getByTestId, getByLabelText, queryByTestId } = render(<HeaderStatusChip />);
    fireEvent.press(getByTestId("header-status-chip"));
    await act(async () => {
      fireEvent.press(getByLabelText("Live menu: go offline"));
    });
    expect(ctl.goOffline).toHaveBeenCalledTimes(1);
    expect(queryByTestId("live-menu")).toBeNull();
  });

  it("popover: Open Arena navigates to the Arena tab and closes (AC-H6)", () => {
    setArena({ isLive: true });
    const { getByTestId, getByLabelText, queryByTestId } = render(<HeaderStatusChip />);
    fireEvent.press(getByTestId("header-status-chip"));
    fireEvent.press(getByLabelText("Live menu: open Arena"));
    expect(mockNavigate).toHaveBeenCalledWith(ARENA_HREF);
    expect(queryByTestId("live-menu")).toBeNull();
  });

  it("popover: an outside tap dismisses it, and going offline elsewhere closes it", () => {
    setArena({ isLive: true });
    const { getByTestId, queryByTestId } = render(<HeaderStatusChip />);
    fireEvent.press(getByTestId("header-status-chip"));
    fireEvent.press(getByTestId("live-menu-backdrop"));
    expect(queryByTestId("live-menu")).toBeNull();

    fireEvent.press(getByTestId("header-status-chip"));
    expect(getByTestId("live-menu")).toBeTruthy();
    setArena({ isLive: false });
    expect(queryByTestId("live-menu")).toBeNull();
  });

  it("popover: Go offline right after a go-live (inside the cooldown) goes out at once (round 3)", async () => {
    setArena({ isLive: true });
    const { getByTestId, getByLabelText } = render(<HeaderStatusChip />);
    // A go-live just landed through the guard: cooldown.
    const { arenaActions } = require("@/lib/arena/arena-store");
    await act(async () => {
      await arenaActions.goLive();
    });
    fireEvent.press(getByTestId("header-status-chip"));
    const off = getByLabelText("Live menu: go offline");
    expect(off.props.accessibilityState).toEqual(expect.objectContaining({ disabled: false }));
    await act(async () => {
      fireEvent.press(off);
    });
    // Recorded and written at once (an offline write is never held back),
    // drawn offline at once.
    expect(ctl.goOffline).toHaveBeenCalledTimes(1);
    expect(chipText(getByTestId)).toContain("GO LIVE · 12");
  });

  it("live with nobody else reads JUST YOU (AC-H5)", () => {
    mockOnMat = 0;
    setArena({ isLive: true });
    const { getByTestId } = render(<HeaderStatusChip />);
    expect(chipText(getByTestId)).toBe("LIVE · JUST YOU");
  });

  it("waiting counts down once a second and returns to the base state at 0:00 (AC-H7)", () => {
    // Jest's default window fontScale is 2 (capped to 1.3): read the 1x copy.
    restoreScale = setFontScale(1);
    setArena({
      isLive: true,
      outgoing: {
        challengeId: "o1",
        opponentId: "a3",
        opponentName: "Alex",
        createdAt: new Date(NOW - (MIN + 48_000)).toISOString(),
        expiresAt: null,
      },
    });
    const { getByTestId } = render(<HeaderStatusChip />);
    expect(chipText(getByTestId)).toBe("WAITING · ALEX · 8:12");

    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(chipText(getByTestId)).toBe("WAITING · ALEX · 8:11");

    act(() => {
      jest.advanceTimersByTime(8 * MIN + 11_000);
    });
    expect(chipText(getByTestId)).toBe("LIVE · 12");
  });

  it("waiting: tap opens the Arena", () => {
    setArena({
      isLive: true,
      outgoing: {
        challengeId: "o1",
        opponentId: "a3",
        opponentName: "Alex",
        createdAt: new Date(NOW - MIN).toISOString(),
      },
    });
    const { getByTestId } = render(<HeaderStatusChip />);
    fireEvent.press(getByTestId("header-status-chip"));
    expect(mockNavigate).toHaveBeenCalledWith(ARENA_HREF);
  });

  it("tucked: ! NAME · m:ss with a red border; tap reopens the sheet (AC-H8)", () => {
    setArena(incomingState(MIN + 19_000));
    const { getByTestId, UNSAFE_root } = render(<HeaderStatusChip />);
    expect(chipText(getByTestId)).toBe(
      "!ALEXANDRIA MONTGOMERY-FEATHERSTONEHAUGH · 8:41",
    );
    const bordered = UNSAFE_root.findAll(
      (n: { type: unknown; props: { className?: unknown } }) =>
        n.type === "View" && typeof n.props.className === "string" &&
        n.props.className.includes("border-cta"),
    );
    expect(bordered.length).toBeGreaterThan(0);
    // Red is the border only: the `!` glyph and the copy stay ink.
    const redText = UNSAFE_root.findAll(
      (n: { type: unknown; props: { className?: unknown } }) =>
        n.type === "Text" && typeof n.props.className === "string" &&
        /\btext-cta\b/.test(n.props.className),
    );
    expect(redText).toHaveLength(0);

    fireEvent.press(getByTestId("header-status-chip"));
    expect(ctl.reopenIncoming).toHaveBeenCalledTimes(1);
  });

  it("truncates the NAME only; the countdown and the count never truncate (AC-H12)", () => {
    setArena(incomingState(MIN));
    const { getByTestId } = render(<HeaderStatusChip />);
    const name = getByTestId("header-status-chip-name");
    const tail = getByTestId("header-status-chip-tail");
    expect(name.props.numberOfLines).toBe(1);
    expect(name.props.ellipsizeMode).toBe("tail");
    expect(name.props.style).toEqual(expect.arrayContaining([{ flexShrink: 1 }]));
    expect(tail.props.style).toEqual(expect.arrayContaining([{ flexShrink: 0 }]));
    expect(tail.props.maxFontSizeMultiplier).toBe(CHIP_MAX_FONT_SCALE);
    expect(name.props.maxFontSizeMultiplier).toBe(CHIP_MAX_FONT_SCALE);
    expect(CHIP_MAX_FONT_SCALE).toBeCloseTo(1.3);

    // The cap is on the whole row, so CONFIRM counts toward it.
    const row = getByTestId("header-status-chip-row");
    expect(row.props.style).toEqual(
      expect.objectContaining({ maxWidth: CHIP_MAX_WIDTH, overflow: "hidden" }),
    );

    setArena({ isLive: true });
    expect(getByTestId("header-status-chip-lead").props.style).toEqual(
      expect.arrayContaining([{ flexShrink: 0 }]),
    );
  });

  it("several fresh incoming: ! 3 WANT TO ROLL, tap reopens the sheet (AC-H9)", () => {
    setArena(incomingState(MIN, { incomingTucked: false, incomingCount: 3 }));
    const { getByTestId } = render(<HeaderStatusChip />);
    expect(chipText(getByTestId)).toBe("!3 WANT TO ROLL");
    fireEvent.press(getByTestId("header-status-chip"));
    expect(ctl.reopenIncoming).toHaveBeenCalledTimes(1);
  });

  it("live + result to confirm: CONFIRM opens the match, the rest opens the popover (AC-H10)", () => {
    mockToConfirm = { matchId: "m-1", status: "in_progress", opponentName: "Sam" };
    setArena({ isLive: true });
    const { getByTestId, getByLabelText } = render(<HeaderStatusChip />);
    expect(getByTestId("header-status-chip-fill")).toBeTruthy();

    fireEvent.press(getByLabelText("Confirm result"));
    expect(mockNavigate).toHaveBeenCalledWith(arenaMatchHref("m-1"));
    expect(mockPush).not.toHaveBeenCalled();
    expect(ctl.goLive).not.toHaveBeenCalled();
    expect(ctl.goOffline).not.toHaveBeenCalled();

    fireEvent.press(getByTestId("header-status-chip"));
    expect(getByTestId("live-menu")).toBeTruthy();
  });

  it("offline + result to confirm: grey, CONFIRM opens the match, the rest goes live (AC-H10)", async () => {
    mockToConfirm = { matchId: "m-2", status: "in_progress", opponentName: null };
    const { getByTestId, queryByTestId } = render(<HeaderStatusChip />);
    expect(queryByTestId("header-status-chip-fill")).toBeNull();
    expect(getByTestId("header-status-chip").props.accessibilityValue).toEqual({
      text: "offline",
    });

    fireEvent.press(getByTestId("header-status-chip-confirm"));
    expect(mockNavigate).toHaveBeenCalledWith(arenaMatchHref("m-2"));
    expect(ctl.goLive).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.press(getByTestId("header-status-chip"));
    });
    expect(ctl.goLive).toHaveBeenCalledTimes(1);
  });

  it("reconnecting and a failed write are never red; RETRY retries (AC-H11)", async () => {
    setArena({ isLive: true, reconnecting: true });
    const { getByTestId, UNSAFE_root } = render(<HeaderStatusChip />);
    expect(chipText(getByTestId)).toBe("◌RECONNECTING");
    expect(getByTestId("header-status-chip-frame").props.className).toMatch(/\bborder-ink-3\b/);
    const red = () =>
      UNSAFE_root.findAll(
        (n: { props: { className?: unknown } }) =>
          typeof n.props.className === "string" && /\b(border|text|bg)-cta\b/.test(n.props.className),
      );
    expect(red()).toHaveLength(0);

    setArena({ isLive: false, lastLiveWriteFailed: true });
    expect(chipText(getByTestId)).toBe("○OFFLINE · RETRY");
    expect(red()).toHaveLength(0);
    await act(async () => {
      fireEvent.press(getByTestId("header-status-chip"));
    });
    expect(ctl.goLive).toHaveBeenCalledTimes(1);
  });

  it("each segment is itself a 44pt touch target, never clipped to the 28pt frame (AC-H13)", () => {
    mockToConfirm = { matchId: "m-1", status: "in_progress", opponentName: null };
    const { getByTestId } = render(<HeaderStatusChip />);
    const row = getByTestId("header-status-chip-row");
    const frame = getByTestId("header-status-chip-frame");
    expect(CHIP_TARGET_HEIGHT).toBeGreaterThanOrEqual(44);
    expect(frame.props.pointerEvents).toBe("none");
    expect(frame.props.style).toEqual(
      expect.objectContaining({
        top: (CHIP_TARGET_HEIGHT - CHIP_HEIGHT) / 2,
        bottom: (CHIP_TARGET_HEIGHT - CHIP_HEIGHT) / 2,
      }),
    );

    for (const id of ["header-status-chip", "header-status-chip-confirm"]) {
      const seg = getByTestId(id);
      const style = ReactNative.StyleSheet.flatten(seg.props.style) ?? {};
      expect(style.height).toBeGreaterThanOrEqual(44);
      if (id === "header-status-chip-confirm") {
        // Wide enough on its own, whatever its copy (AC-H13).
        expect(style.minWidth).toBeGreaterThanOrEqual(44);
      }
      // No vertical hitSlop to lean on, and no horizontal overlap between
      // the two adjacent segments' targets.
      expect(seg.props.hitSlop).toBeUndefined();

      // No ancestor inside the chip may clip the target below 44pt.
      let node = seg.parent;
      while (node && node !== row.parent) {
        const st = ReactNative.StyleSheet.flatten(node.props.style) ?? {};
        const cls = typeof node.props.className === "string" ? node.props.className : "";
        const clips = st.overflow === "hidden" || /\boverflow-hidden\b/.test(cls);
        if (clips) {
          expect(typeof st.height === "number" && st.height >= 44).toBe(true);
        }
        node = node.parent;
      }
    }
  });

  it("uses distinct accessibility labels (AC-H13)", () => {
    mockToConfirm = { matchId: "m-1", status: "in_progress", opponentName: null };
    const { getByTestId } = render(<HeaderStatusChip />);
    expect(getByTestId("header-status-chip").props.accessibilityLabel).toBe(
      "Live status: 12 on the mat. Go live",
    );
    expect(getByTestId("header-status-chip-confirm").props.accessibilityLabel).toBe(
      "Confirm result",
    );
  });

  it("at large Dynamic Type the count stays and CONFIRM shortens to its marker (AC-H12)", () => {
    mockToConfirm = { matchId: "m-3", status: "in_progress", opponentName: null };
    const restore = setFontScale(3.1);
    try {
      const { getByTestId } = render(<HeaderStatusChip />);
      expect(getByTestId("header-status-chip-lead").props.children).toBe("GO LIVE · 12");
      expect(getByTestId("header-status-chip-lead").props.maxFontSizeMultiplier).toBe(
        CHIP_MAX_FONT_SCALE,
      );
      expect(getByTestId("header-status-chip-confirm-text").props.children).toBe(
        CONFIRM_COPY_COMPACT,
      );
      expect(getByTestId("header-status-chip-confirm").props.accessibilityLabel).toBe(
        "Confirm result",
      );
    } finally {
      restore();
    }
  });

  it("JUST YOU plus CONFIRM at the 1.3x cap keeps its copy and draws a step smaller", () => {
    mockToConfirm = { matchId: "m-3", status: "in_progress", opponentName: null };
    mockOnMat = 0;
    const restore = setFontScale(CHIP_MAX_FONT_SCALE);
    try {
      setArena({ isLive: true });
      const { getByTestId } = render(<HeaderStatusChip />);
      const lead = getByTestId("header-status-chip-lead");
      expect(lead.props.children).toBe("LIVE · JUST YOU");
      expect(lead.props.maxFontSizeMultiplier).toBeLessThan(CHIP_MAX_FONT_SCALE);
      expect(lead.props.maxFontSizeMultiplier).toBeGreaterThanOrEqual(1);
      // Every piece of chip copy draws at the same size.
      expect(getByTestId("header-status-chip-confirm-text").props.maxFontSizeMultiplier).toBe(
        lead.props.maxFontSizeMultiplier,
      );
      expect(getByTestId("header-status-chip-confirm-text").props.children).toBe(
        CONFIRM_COPY_COMPACT,
      );
    } finally {
      restore();
    }
  });

  it("the ▪ marker keeps a 44pt-wide target, its label and its tap", () => {
    mockToConfirm = { matchId: "m-3", status: "in_progress", opponentName: null };
    setArena({ isSaving: true });
    const restore = setFontScale(CHIP_MAX_FONT_SCALE);
    try {
      const { getByTestId } = render(<HeaderStatusChip />);
      expect(getByTestId("header-status-chip-confirm-text").props.children).toBe(
        CONFIRM_COPY_COMPACT,
      );
      const seg = getByTestId("header-status-chip-confirm");
      const style = ReactNative.StyleSheet.flatten(seg.props.style) ?? {};
      expect(style.minWidth).toBeGreaterThanOrEqual(44);
      expect(style.height).toBeGreaterThanOrEqual(44);
      expect(seg.props.accessibilityLabel).toBe("Confirm result");
      fireEvent.press(seg);
      expect(mockNavigate).toHaveBeenCalledWith(arenaMatchHref("m-3"));
    } finally {
      restore();
    }
  });

  it("a double tap on CONFIRM navigates (deduped), never pushes twice", () => {
    mockToConfirm = { matchId: "m-5", status: "in_progress", opponentName: null };
    const { getByTestId } = render(<HeaderStatusChip />);
    fireEvent.press(getByTestId("header-status-chip-confirm"));
    fireEvent.press(getByTestId("header-status-chip-confirm"));
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith(arenaMatchHref("m-5"));
  });

  it("WAITING at the 1.3x cap keeps its separators; the name ellipsizes (AC-H7)", () => {
    const restore = setFontScale(CHIP_MAX_FONT_SCALE);
    try {
      setArena({
        isLive: true,
        outgoing: {
          challengeId: "o1",
          opponentId: "a3",
          opponentName: "Alexandria Montgomery-Featherstonehaugh",
          createdAt: new Date(NOW - (MIN + 48_000)).toISOString(),
          expiresAt: null,
        },
      });
      const { getByTestId } = render(<HeaderStatusChip />);
      expect(getByTestId("header-status-chip-lead").props.children).toBe("WAITING · ");
      expect(getByTestId("header-status-chip-tail").props.children).toBe(" · 8:12");
      expect(getByTestId("header-status-chip-name").props.ellipsizeMode).toBe("tail");
    } finally {
      restore();
    }
  });

  it("CONFIRM reads in full at the default text size", () => {
    mockToConfirm = { matchId: "m-3", status: "in_progress", opponentName: null };
    const restore = setFontScale(1);
    try {
      setArena({ isLive: true });
      const { getByTestId } = render(<HeaderStatusChip />);
      expect(getByTestId("header-status-chip-confirm-text").props.children).toBe(
        CONFIRM_COPY_FULL,
      );
    } finally {
      restore();
    }
  });

  it("CONFIRM still opens the match while the status segment is locked", async () => {
    mockToConfirm = { matchId: "m-4", status: "in_progress", opponentName: null };
    setArena({ isSaving: true });
    const { getByTestId } = render(<HeaderStatusChip />);
    expect(getByTestId("header-status-chip").props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );
    fireEvent.press(getByTestId("header-status-chip-confirm"));
    expect(mockNavigate).toHaveBeenCalledWith(arenaMatchHref("m-4"));
    expect(ctl.goLive).not.toHaveBeenCalled();
  });

  it("closes an open popover when a challenge takes over the chip", () => {
    setArena({ isLive: true });
    const { getByTestId, queryByTestId } = render(<HeaderStatusChip />);
    fireEvent.press(getByTestId("header-status-chip"));
    expect(getByTestId("live-menu")).toBeTruthy();

    setArena(incomingState(MIN, { incomingTucked: false, incomingCount: 2 }));
    expect(queryByTestId("live-menu")).toBeNull();
  });

  it("closes an open popover when WAITING takes over the chip", () => {
    setArena({ isLive: true });
    const { getByTestId, queryByTestId } = render(<HeaderStatusChip />);
    fireEvent.press(getByTestId("header-status-chip"));
    setArena({
      isLive: true,
      outgoing: {
        challengeId: "o1",
        opponentId: "a3",
        opponentName: "Alex",
        createdAt: new Date(NOW - MIN).toISOString(),
      },
    });
    expect(queryByTestId("live-menu")).toBeNull();
  });

  it("closes an open popover when a single challenge's prompt sheet comes up", () => {
    setArena({ isLive: true });
    const { getByTestId, queryByTestId } = render(<HeaderStatusChip />);
    fireEvent.press(getByTestId("header-status-chip"));
    expect(getByTestId("live-menu")).toBeTruthy();

    // One untucked challenge leaves the chip on LIVE, but the sheet is up.
    setArena(incomingState(MIN, { incomingTucked: false, incomingCount: 1 }));
    expect(chipText(getByTestId)).toBe("LIVE · 12");
    expect(queryByTestId("live-menu")).toBeNull();

    // And the menu refuses to open over it.
    fireEvent.press(getByTestId("header-status-chip"));
    expect(queryByTestId("live-menu")).toBeNull();

    // Tucked away with Later, the chip takes over (and reopens the sheet).
    setArena(incomingState(MIN, { incomingTucked: true, incomingCount: 1 }));
    fireEvent.press(getByTestId("header-status-chip"));
    expect(ctl.reopenIncoming).toHaveBeenCalledTimes(1);
  });

  it("popover: a failed go-offline says so with the toggle's copy", async () => {
    ctl = controller({ goOffline: jest.fn(async () => false) });
    registerArenaController(ctl);
    setArena({ isLive: true });
    const { getByTestId, getByLabelText } = render(<HeaderStatusChip />);
    fireEvent.press(getByTestId("header-status-chip"));
    await act(async () => {
      fireEvent.press(getByLabelText("Live menu: go offline"));
    });
    expect(ctl.goOffline).toHaveBeenCalledTimes(1);
    // Neutral, never Signal Red: a live-flag write failure is ink-3 (spec 3).
    expect(mockToastInfo).toHaveBeenCalledWith(GO_OFFLINE_FAILED_MESSAGE);
    expect(mockToastError).not.toHaveBeenCalled();
  });

  it("popover: a successful go-offline does not toast", async () => {
    setArena({ isLive: true });
    const { getByTestId, getByLabelText } = render(<HeaderStatusChip />);
    fireEvent.press(getByTestId("header-status-chip"));
    await act(async () => {
      fireEvent.press(getByLabelText("Live menu: go offline"));
    });
    expect(ctl.goOffline).toHaveBeenCalledTimes(1);
    expect(mockToastError).not.toHaveBeenCalled();
    expect(mockToastInfo).not.toHaveBeenCalled();
  });

  it("popover: the Modal lays out from the screen top on Android (edge-to-edge)", () => {
    setArena({ isLive: true });
    const { getByTestId, UNSAFE_getByType } = render(<HeaderStatusChip />);
    fireEvent.press(getByTestId("header-status-chip"));
    const modal = UNSAFE_getByType(ReactNative.Modal);
    expect(modal.props.statusBarTranslucent).toBe(true);
    expect(modal.props.navigationBarTranslucent).toBe(true);
  });

  it("the countdown ticks on its own second boundary, not the render's", () => {
    // Jest's default window fontScale is 2 (capped to 1.3): read the 1x copy.
    restoreScale = setFontScale(1);
    setArena({
      isLive: true,
      outgoing: {
        challengeId: "o1",
        opponentId: "a3",
        opponentName: "Alex",
        // 491.5s left: shows 8:12 and must flip to 8:11 after 500ms.
        createdAt: new Date(NOW - (MIN + 48_500)).toISOString(),
        expiresAt: null,
      },
    });
    const { getByTestId } = render(<HeaderStatusChip />);
    expect(chipText(getByTestId)).toBe("WAITING · ALEX · 8:12");
    act(() => {
      jest.advanceTimersByTime(500);
    });
    expect(chipText(getByTestId)).toBe("WAITING · ALEX · 8:11");
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(chipText(getByTestId)).toBe("WAITING · ALEX · 8:10");
  });

  it("runs no clock when no countdown is drawn", () => {
    setArena({
      isLive: true,
      outgoing: { challengeId: "o1", opponentId: "a3", opponentName: "Alex", createdAt: null },
    });
    const { getByTestId } = render(<HeaderStatusChip />);
    expect(chipText(getByTestId)).toBe("WAITING · ALEX");
    expect(jest.getTimerCount()).toBe(0);
  });

  it("stops ticking once a tucked challenge lapses", () => {
    setArena(incomingState(10 * MIN - 1000));
    const { getByTestId } = render(<HeaderStatusChip />);
    expect(jest.getTimerCount()).toBe(1);
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(chipText(getByTestId)).toBe("LIVE · 12");
    expect(jest.getTimerCount()).toBe(0);
  });

  it("an unfocused tab's chip does not tick; it resumes on focus", () => {
    const listeners: Record<string, Array<() => void>> = { focus: [], blur: [] };
    let focused = false;
    const navigation: Pick<NavigationProp<ParamListBase>, "isFocused" | "addListener"> = {
      isFocused: () => focused,
      // The chip only subscribes to focus and blur.
      addListener: ((e: "focus" | "blur", cb: () => void) => {
        listeners[e].push(cb);
        return () => {
          listeners[e] = listeners[e].filter((f) => f !== cb);
        };
      }) as NavigationProp<ParamListBase>["addListener"],
    };
    setArena(incomingState(MIN));
    const { getByTestId } = render(
      <NavigationContext.Provider value={navigation as unknown as NavigationProp<ParamListBase>}>
        <HeaderStatusChip />
      </NavigationContext.Provider>,
    );
    expect(chipText(getByTestId)).toContain("9:00");
    expect(jest.getTimerCount()).toBe(0);

    act(() => {
      focused = true;
      listeners.focus.forEach((f) => f());
    });
    expect(jest.getTimerCount()).toBe(1);
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(chipText(getByTestId)).toContain("8:59");

    act(() => {
      focused = false;
      listeners.blur.forEach((f) => f());
    });
    expect(jest.getTimerCount()).toBe(0);
  });

  it("waiting while offline draws no green, no fill and no live dot", () => {
    restoreScale = setFontScale(1);
    setArena({
      isLive: false,
      outgoing: {
        challengeId: "o1",
        opponentId: "a3",
        opponentName: "Alex",
        createdAt: new Date(NOW - (MIN + 48_000)).toISOString(),
        expiresAt: null,
      },
    });
    const { getByTestId, queryByTestId, UNSAFE_queryAllByType, UNSAFE_root } = render(
      <HeaderStatusChip />,
    );
    expect(chipText(getByTestId)).toBe("○WAITING · ALEX · 8:12");
    expect(queryByTestId("header-status-chip-fill")).toBeNull();
    expect(UNSAFE_queryAllByType(LiveDot)).toHaveLength(0);
    const green = UNSAFE_root.findAll(
      (n: { props: { className?: unknown } }) =>
        typeof n.props.className === "string" && /\b(border|text|bg)-positive\b/.test(n.props.className),
    );
    expect(green).toHaveLength(0);
    expect(getByTestId("header-status-chip-frame").props.className).toMatch(/\bborder-ink-3\b/);
    expect(getByTestId("header-status-chip").props.accessibilityValue).toEqual({
      text: "offline",
    });
    fireEvent.press(getByTestId("header-status-chip"));
    expect(mockNavigate).toHaveBeenCalledWith(ARENA_HREF);
  });

  it("GOING LIVE carries no accessibilityValue", async () => {
    let finish: (v: boolean) => void = () => undefined;
    __resetArenaStoreForTests();
    registerArenaController(
      controller({ goLive: jest.fn(() => new Promise<boolean>((r) => (finish = r))) }),
    );
    const { getByTestId } = render(<HeaderStatusChip />);
    fireEvent.press(getByTestId("header-status-chip"));
    // Nothing pending is drawn for the first 240 ms (UX 019, 2.3): the chip
    // keeps its offline look, but takes no taps.
    expect(getByTestId("header-status-chip").props.accessibilityLabel).toBe(
      "Live status: 12 on the mat. Go live",
    );
    expect(getByTestId("header-status-chip").props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );
    act(() => {
      jest.advanceTimersByTime(PENDING_REVEAL_MS);
    });
    expect(getByTestId("header-status-chip").props.accessibilityLabel).toBe(
      "Live status: going live",
    );
    expect(getByTestId("header-status-chip").props.accessibilityValue?.text).toBeUndefined();
    await act(async () => {
      finish(true);
    });
  });

  it("a countdown that replaces another ticks on the new one's second boundary", () => {
    restoreScale = setFontScale(1);
    // WAITING with 491.05s left: its next boundary is 50ms away, then 1000ms
    // apart. After that boundary, swap to a tucked challenge whose next
    // boundary is only 100ms away: the old 1000ms timer must not win.
    setArena({
      isLive: true,
      outgoing: {
        challengeId: "o1",
        opponentId: "a3",
        opponentName: "Alex",
        createdAt: new Date(NOW - (MIN + 48_950)).toISOString(),
        expiresAt: null,
      },
    });
    const { getByTestId } = render(<HeaderStatusChip />);
    act(() => {
      jest.advanceTimersByTime(50);
    });
    // Now 491s left exactly: the WAITING timer is armed a full 1000ms out.
    expect(chipText(getByTestId)).toBe("WAITING · ALEX · 8:11");
    setArena({
      isLive: true,
      incoming: {
        challengeId: "c1",
        challengerId: "a2",
        challengerName: "Sam",
        challengerElo: 1500,
        challengerWeight: 80,
        // 300.1s left: shows 5:01 and must flip to 5:00 after 100ms.
        createdAt: new Date(Date.now() - (5 * MIN - 100)).toISOString(),
        expiresAt: null,
      },
      incomingTucked: true,
      incomingCount: 1,
    });
    expect(chipText(getByTestId)).toBe("!SAM · 5:01");
    act(() => {
      jest.advanceTimersByTime(100);
    });
    expect(chipText(getByTestId)).toBe("!SAM · 5:00");
  });

  it("fits the width the header leaves it (a 320pt-wide phone)", () => {
    mockToConfirm = { matchId: "m-3", status: "in_progress", opponentName: null };
    restoreScale = setFontScale(CHIP_MAX_FONT_SCALE);
    const { getByTestId } = render(<HeaderStatusChip />);
    const before = getByTestId("header-status-chip-lead").props.maxFontSizeMultiplier;
    act(() => {
      fireEvent(getByTestId("header-status-chip-slot"), "layout", {
        nativeEvent: { layout: { x: 0, y: 0, width: 136, height: 44 } },
      });
    });
    const lead = getByTestId("header-status-chip-lead");
    expect(lead.props.children).toBe("GO LIVE · 12");
    expect(lead.props.maxFontSizeMultiplier).toBeLessThan(before);
    expect(lead.props.maxFontSizeMultiplier).toBeGreaterThanOrEqual(1);
    expect(getByTestId("header-status-chip-confirm-text").props.children).toBe(
      CONFIRM_COPY_COMPACT,
    );
    const m = describeHeaderChip(input({ confirm: true }));
    expect(
      estimateChipWidth(m, lead.props.maxFontSizeMultiplier, CONFIRM_COPY_COMPACT, 1),
    ).toBeLessThanOrEqual(136);

    // Retry + CONFIRM needs text under 1x there: drawn via the font size.
    setArena({ lastLiveWriteFailed: true });
    const retry = describeHeaderChip(input({ lastLiveWriteFailed: true, confirm: true }));
    const narrow = layoutChip(retry, CHIP_MAX_FONT_SCALE, 136);
    expect(narrow.textScale).toBeLessThan(1);
    const retryLead = getByTestId("header-status-chip-lead");
    expect(retryLead.props.children).toBe("OFFLINE · RETRY");
    expect(retryLead.props.maxFontSizeMultiplier).toBe(1);
    const flat = ReactNative.StyleSheet.flatten(retryLead.props.style);
    expect(flat.fontSize).toBeCloseTo(10 * narrow.textScale);
    expect(
      estimateChipWidth(retry, narrow.textScale, narrow.confirmCopy, 1),
    ).toBeLessThanOrEqual(136);
    setArena({});

    // A roomy header (375pt and up) is still held to the 160pt cap.
    act(() => {
      fireEvent(getByTestId("header-status-chip-slot"), "layout", {
        nativeEvent: { layout: { x: 0, y: 0, width: 191, height: 44 } },
      });
    });
    expect(getByTestId("header-status-chip-lead").props.maxFontSizeMultiplier).toBe(
      layoutChip(m, CHIP_MAX_FONT_SCALE).textScale,
    );
  });
});
