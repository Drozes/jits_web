/**
 * The live incoming challenge prompt (`ChallengePromptSheet`). Covers:
 *
 *  - open/close: the regression where the FIRST challenge after every launch
 *    was invisible. gorhom's BottomSheetModal gets stuck in DISMISSING when
 *    dismiss() is called on a sheet that is not showing, so the prompt must
 *    only dismiss a sheet it presented and that has not already closed
 *    itself; plus the Later-then-quick-reopen race;
 *  - accessibility (jits-ef2a): the buttons stay reachable by label;
 *  - the Warning haptic (jits-4zp.7) and the stakes preview (with its cache
 *    across a Later and reopen);
 *  - the sheet upgrade (spec 5): countdown AC-S1, buttons AC-S2, input guard
 *    AC-S3 (including a challenge replaced in place), Later AC-S4/AC-S7,
 *    "+N more" AC-S6, and the Dynamic Type caps.
 */
import * as React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";

const mockPresent = jest.fn();
const mockDismiss = jest.fn();
let mockOnChange: ((idx: number) => void) | undefined;
let mockSheetProps: Record<string, unknown> = {};
let mockSheetRenders = 0;

jest.mock("@gorhom/bottom-sheet", () => {
  const R = require("react");
  const RN = require("react-native");
  return {
    BottomSheetModal: R.forwardRef(
      (
        props: { children: React.ReactNode; onChange?: (idx: number) => void },
        ref: unknown,
      ) => {
        mockOnChange = props.onChange;
        mockSheetRenders += 1;
        mockSheetProps = props as Record<string, unknown>;
        R.useImperativeHandle(ref, () => ({ present: mockPresent, dismiss: mockDismiss }));
        return R.createElement(RN.View, {}, props.children);
      },
    ),
    BottomSheetView: (props: { children: React.ReactNode }) =>
      R.createElement(RN.View, {}, props.children),
  };
});

const mockNotify = jest.fn((_type: unknown) => Promise.resolve());
jest.mock("expo-haptics", () => ({
  notificationAsync: (t: unknown) => mockNotify(t),
  NotificationFeedbackType: { Success: "success", Warning: "warning", Error: "error" },
}));

jest.mock("@/lib/theme/use-theme", () => ({
  useResolvedColorScheme: () => "light",
  useThemedTokens: () => ({ bgSecondary: "#13151B", textTertiary: "#8D929D" }),
}));

jest.mock("@/lib/supabase/client", () => ({ supabase: { tag: "client" } }));

const mockGetEloStakes = jest.fn();
jest.mock("@jits/shared/api/queries", () => ({
  getEloStakes: (...args: unknown[]) => mockGetEloStakes(...args),
}));

import { ChallengePromptSheet } from "@/components/arena/challenge-prompt-sheet";
import { PROMPT_INPUT_GUARD_MS } from "@/lib/arena/constants";
import { __resetServerClockForTests } from "@/lib/arena/incoming-challenges";
import { formatCountdown, useFreshCountdown } from "@/lib/arena/fresh-countdown";
import { StyleSheet } from "react-native";
import { paletteFor } from "@/lib/theme/palette";
import type { IncomingChallenge } from "@/lib/arena/use-arena-challenge";

const RIVAL: IncomingChallenge = {
  challengeId: "ch-1",
  challengerId: "a-9",
  challengerName: "Rival",
  challengerElo: 1350,
  challengerWeight: 190,
  createdAt: null,
  expiresAt: null,
};

function Harness({ challenge }: { challenge: IncomingChallenge | null }) {
  return (
    <ChallengePromptSheet
      challenge={challenge}
      busy={false}
      onAccept={jest.fn()}
      onDecline={jest.fn()}
    />
  );
}

beforeEach(() => {
  mockGetEloStakes.mockReset();
  mockGetEloStakes.mockResolvedValue(null);
  mockPresent.mockClear();
  mockDismiss.mockClear();
  mockNotify.mockClear();
  mockOnChange = undefined;
  __resetServerClockForTests();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("ChallengePromptSheet open/close", () => {
  it("does not dismiss a sheet that was never presented (every launch)", () => {
    render(<Harness challenge={null} />);
    expect(mockDismiss).not.toHaveBeenCalled();
    expect(mockPresent).not.toHaveBeenCalled();
  });

  it("presents the first challenge after launch without a prior dismiss", () => {
    const { rerender } = render(<Harness challenge={null} />);
    rerender(<Harness challenge={RIVAL} />);

    expect(mockDismiss).not.toHaveBeenCalled();
    expect(mockPresent).toHaveBeenCalledTimes(1);
  });

  it("dismisses once the challenge is answered or withdrawn", () => {
    const { rerender } = render(<Harness challenge={null} />);
    rerender(<Harness challenge={RIVAL} />);
    rerender(<Harness challenge={null} />);
    expect(mockDismiss).toHaveBeenCalledTimes(1);

    // A second null render does not dismiss again.
    rerender(<Harness challenge={null} />);
    expect(mockDismiss).toHaveBeenCalledTimes(1);
  });

  it("does not dismiss a sheet that already closed itself, and can present again", () => {
    const { rerender } = render(<Harness challenge={RIVAL} />);
    act(() => mockOnChange?.(-1));
    rerender(<Harness challenge={null} />);
    expect(mockDismiss).not.toHaveBeenCalled();

    rerender(<Harness challenge={{ ...RIVAL, challengeId: "ch-2" }} />);
    expect(mockPresent).toHaveBeenCalledTimes(2);
  });

  it("re-presents after a quick reopen whose present() the running dismiss swallowed", () => {
    // Later (null), then the chip reopens it before the dismiss animation
    // ends. gorhom 5.2.x ignores that present() while its forced close runs,
    // finishes the close (onChange(-1)) and unmounts the modal (onDismiss).
    const { rerender } = render(<Harness challenge={RIVAL} />);
    act(() => mockOnChange?.(0));
    rerender(<Harness challenge={null} />);
    expect(mockDismiss).toHaveBeenCalledTimes(1);
    rerender(<Harness challenge={RIVAL} />);
    expect(mockPresent).toHaveBeenCalledTimes(2); // swallowed by the mock's gorhom

    act(() => mockOnChange?.(-1));
    // The close alone does not re-present: the modal is still unmounting.
    expect(mockPresent).toHaveBeenCalledTimes(2);
    act(() => (mockSheetProps.onDismiss as () => void)());
    expect(mockPresent).toHaveBeenCalledTimes(3);

    // The re-presented sheet is tracked as up: the next null dismisses it.
    act(() => mockOnChange?.(0));
    rerender(<Harness challenge={null} />);
    expect(mockDismiss).toHaveBeenCalledTimes(2);
  });

  it("presents a challenge that arrives while the previous one's dismiss is running", () => {
    // Challenge A cancelled (null), challenge B arrives before A's close ends.
    const { rerender } = render(<Harness challenge={RIVAL} />);
    act(() => mockOnChange?.(0));
    rerender(<Harness challenge={null} />);
    rerender(<Harness challenge={{ ...RIVAL, challengeId: "ch-2" }} />);
    act(() => mockOnChange?.(-1));
    act(() => (mockSheetProps.onDismiss as () => void)());
    expect(mockPresent).toHaveBeenCalledTimes(3);
  });

  it("re-arms the input guard for the re-presented sheet", () => {
    jest.useFakeTimers();
    const onAccept = jest.fn();
    const { rerender, getByTestId } = render(
      <ChallengePromptSheet challenge={RIVAL} busy={false} onAccept={onAccept} onDecline={jest.fn()} />,
    );
    act(() => mockOnChange?.(0));
    act(() => jest.advanceTimersByTime(PROMPT_INPUT_GUARD_MS));
    rerender(<ChallengePromptSheet challenge={null} busy={false} onAccept={onAccept} onDecline={jest.fn()} />);
    rerender(<ChallengePromptSheet challenge={RIVAL} busy={false} onAccept={onAccept} onDecline={jest.fn()} />);
    act(() => jest.advanceTimersByTime(PROMPT_INPUT_GUARD_MS));
    act(() => mockOnChange?.(-1));
    act(() => (mockSheetProps.onDismiss as () => void)());

    // Just back up: guarded.
    expect(getByTestId("challenge-prompt-accept").props.accessibilityState).toEqual({ disabled: true });
    fireEvent.press(getByTestId("challenge-prompt-accept"));
    expect(onAccept).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(PROMPT_INPUT_GUARD_MS));
    fireEvent.press(getByTestId("challenge-prompt-accept"));
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it("does not dismiss or re-present when the challenge is gone by the time the close lands", () => {
    const { rerender } = render(<Harness challenge={RIVAL} />);
    act(() => mockOnChange?.(0));
    rerender(<Harness challenge={null} />);
    rerender(<Harness challenge={RIVAL} />);
    act(() => mockOnChange?.(-1));
    rerender(<Harness challenge={null} />);
    // Already closing and unmounting: dismissing it again would leave gorhom
    // stuck in DISMISSING.
    expect(mockDismiss).toHaveBeenCalledTimes(1);
    act(() => (mockSheetProps.onDismiss as () => void)());
    expect(mockPresent).toHaveBeenCalledTimes(2);
  });

  it("does nothing on the unmount that follows its own dismiss", () => {
    const { rerender } = render(<Harness challenge={RIVAL} />);
    act(() => mockOnChange?.(0));
    rerender(<Harness challenge={null} />);
    act(() => mockOnChange?.(-1));
    act(() => (mockSheetProps.onDismiss as () => void)());
    expect(mockPresent).toHaveBeenCalledTimes(1);
  });

  it("hides the grabber on a sheet that cannot be swiped closed (AC-S7)", () => {
    render(<Harness challenge={RIVAL} />);
    expect(mockSheetProps.enablePanDownToClose).toBe(false);
    expect((mockSheetProps.handleIndicatorStyle as { opacity?: number }).opacity).toBe(0);
  });

  it("sizes to its content rather than a percentage snap point", () => {
    render(<Harness challenge={null} />);
    expect(mockSheetProps.enableDynamicSizing).toBe(true);
    expect(mockSheetProps.snapPoints).toBeUndefined();
  });
});

describe("ChallengePromptSheet accessibility (jits-ef2a)", () => {
  it("turns off gorhom's accessible 'Bottom Sheet' container, which hid Accept/Decline", () => {
    // gorhom defaults the content container to accessible=true with the
    // label "Bottom Sheet"; an accessible element is a leaf to VoiceOver and
    // idb, so nothing inside it could be reached.
    render(<Harness challenge={RIVAL} />);
    expect(mockSheetProps.accessible).toBe(false);
  });

  it("replaces the background that announced itself as an adjustable 'Bottom Sheet'", () => {
    render(<Harness challenge={RIVAL} />);
    const Background = mockSheetProps.backgroundComponent as React.ComponentType<{
      style?: unknown;
      pointerEvents?: string;
    }>;
    expect(Background).toBeDefined();

    const { UNSAFE_root } = render(<Background style={{}} pointerEvents="none" />);
    const view = UNSAFE_root.findByType(require("react-native").View);
    expect(view.props.accessible).toBe(false);
    expect(view.props.accessibilityLabel).toBeUndefined();
    expect(view.props.accessibilityRole).toBeUndefined();
  });

  it("exposes Accept and Decline as labelled buttons", () => {
    jest.useFakeTimers();
    const onAccept = jest.fn();
    const onDecline = jest.fn();
    const { getByRole } = render(
      <ChallengePromptSheet
        challenge={RIVAL}
        busy={false}
        onAccept={onAccept}
        onDecline={onDecline}
      />,
    );
    // Past the input guard (AC-S3).
    act(() => jest.advanceTimersByTime(PROMPT_INPUT_GUARD_MS));

    fireEvent.press(getByRole("button", { name: "Accept challenge" }));
    fireEvent.press(getByRole("button", { name: "Decline challenge" }));
    expect(onAccept).toHaveBeenCalledTimes(1);
    expect(onDecline).toHaveBeenCalledTimes(1);
  });

  it("keeps the challenge-prompt testID, as a modal accessibility container", () => {
    const { getByTestId } = render(<Harness challenge={RIVAL} />);
    const prompt = getByTestId("challenge-prompt");
    expect(prompt.props.accessibilityViewIsModal).toBe(true);
    // A container, not a leaf: its buttons must stay individually reachable.
    expect(prompt.props.accessible).not.toBe(true);
  });
});

describe("ChallengePromptSheet haptic (jits-4zp.7)", () => {
  it("buzzes a Warning once when a challenge is presented", () => {
    const { rerender } = render(<Harness challenge={null} />);
    expect(mockNotify).not.toHaveBeenCalled();
    rerender(<Harness challenge={RIVAL} />);
    expect(mockNotify).toHaveBeenCalledTimes(1);
    expect(mockNotify).toHaveBeenCalledWith("warning");
  });

  it("does not buzz again for the same challenge re-rendered as a new object", () => {
    const { rerender } = render(<Harness challenge={RIVAL} />);
    rerender(<Harness challenge={{ ...RIVAL }} />);
    expect(mockNotify).toHaveBeenCalledTimes(1);
  });

  it("buzzes again for the next, different challenge", () => {
    const { rerender } = render(<Harness challenge={RIVAL} />);
    rerender(<Harness challenge={null} />);
    rerender(<Harness challenge={{ ...RIVAL, challengeId: "ch-2" }} />);
    expect(mockNotify).toHaveBeenCalledTimes(2);
  });

  it("never lets a haptics failure escape", async () => {
    mockNotify.mockImplementationOnce(() => Promise.reject(new Error("no engine")));
    render(<Harness challenge={RIVAL} />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockPresent).toHaveBeenCalledTimes(1);
  });
});

describe("ChallengePromptSheet face-off preview (match-flow redesign)", () => {
  const STAKES = {
    challenger_win: 14,
    challenger_loss: -9,
    challenger_draw: -2,
    opponent_win: 9,
    opponent_loss: -14,
    opponent_draw: 2,
    challenger_expected: 0.5,
    opponent_expected: 0.5,
    weight_division_gap: 0,
    draw_score: 0.25,
  };

  it("shows the viewer's stakes, read once with the viewer as challenger", async () => {
    mockGetEloStakes.mockResolvedValue(STAKES);
    const screen = render(
      <ChallengePromptSheet
        challenge={RIVAL}
        busy={false}
        onAccept={jest.fn()}
        onDecline={jest.fn()}
        viewer={{ elo: 1512, weight: 170 }}
      />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockGetEloStakes).toHaveBeenCalledWith(expect.anything(), 1512, 1350, 170, 190);
    expect(screen.getByTestId("challenge-prompt-stakes-win")).toHaveTextContent("\u25b2 +14");
    expect(screen.getByTestId("challenge-prompt-stakes-loss")).toHaveTextContent("\u25bc \u22129");
    expect(screen.getByText("YOUR STAKES \u00b7 1512")).toBeTruthy();
    expect(screen.getByText("RANKED")).toBeTruthy();
    expect(screen.getByText("Rival is live in the Arena")).toBeTruthy();
  });

  it("keeps the stakes across a Later and reopen, so the sheet does not change height", async () => {
    mockGetEloStakes.mockResolvedValue(STAKES);
    const viewer = { elo: 1512, weight: 170 };
    const screen = render(
      <ChallengePromptSheet challenge={RIVAL} busy={false} onAccept={jest.fn()} onDecline={jest.fn()} viewer={viewer} />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId("challenge-prompt-stakes")).toBeTruthy();

    // Tucked with Later, then reopened from the chip: the strip is there on
    // the very first render, with no fallback line in between.
    mockGetEloStakes.mockReturnValue(new Promise(() => undefined));
    screen.rerender(
      <ChallengePromptSheet challenge={null} busy={false} onAccept={jest.fn()} onDecline={jest.fn()} viewer={viewer} />,
    );
    screen.rerender(
      <ChallengePromptSheet challenge={RIVAL} busy={false} onAccept={jest.fn()} onDecline={jest.fn()} viewer={viewer} />,
    );
    expect(screen.getByTestId("challenge-prompt-stakes-win")).toHaveTextContent("\u25b2 +14");
    expect(screen.queryByTestId("challenge-prompt-fallback")).toBeNull();
    // And no second calculate_elo_stakes read for inputs already answered,
    // however many times it is tucked and reopened.
    for (let i = 0; i < 3; i += 1) {
      screen.rerender(
        <ChallengePromptSheet challenge={null} busy={false} onAccept={jest.fn()} onDecline={jest.fn()} viewer={viewer} />,
      );
      screen.rerender(
        <ChallengePromptSheet challenge={RIVAL} busy={false} onAccept={jest.fn()} onDecline={jest.fn()} viewer={viewer} />,
      );
    }
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockGetEloStakes).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("challenge-prompt-stakes-win")).toHaveTextContent("\u25b2 +14");

    // A different challenger (another rating) never borrows them.
    screen.rerender(
      <ChallengePromptSheet
        challenge={{ ...RIVAL, challengeId: "ch-2", challengerElo: 1800 }}
        busy={false}
        onAccept={jest.fn()}
        onDecline={jest.fn()}
        viewer={viewer}
      />,
    );
    expect(screen.queryByTestId("challenge-prompt-stakes")).toBeNull();
    expect(screen.getByTestId("challenge-prompt-fallback")).toBeTruthy();
  });

  it.each([
    ["pending", () => new Promise(() => undefined)],
    ["rejecting", () => Promise.reject(new Error("offline"))],
  ])(
    "never shows challenger A's stakes for B replaced in place while B's read is %s",
    async (_label, bRead) => {
      const viewer = { elo: 1512, weight: 170 };
      const A = { ...RIVAL, challengeId: "ch-a", challengerElo: 1500 };
      const B = { ...RIVAL, challengeId: "ch-b", challengerName: "Bravo", challengerElo: 1800 };
      mockGetEloStakes.mockResolvedValueOnce(STAKES);
      const screen = render(
        <ChallengePromptSheet challenge={A} busy={false} onAccept={jest.fn()} onDecline={jest.fn()} viewer={viewer} />,
      );
      await act(async () => {
        await Promise.resolve();
      });
      expect(screen.getByTestId("challenge-prompt-stakes-win")).toHaveTextContent("\u25b2 +14");

      mockGetEloStakes.mockImplementationOnce(bRead);
      screen.rerender(
        <ChallengePromptSheet challenge={B} busy={false} onAccept={jest.fn()} onDecline={jest.fn()} viewer={viewer} />,
      );
      // The very first render for B: A's stakes are already gone.
      expect(screen.queryByTestId("challenge-prompt-stakes")).toBeNull();
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(mockGetEloStakes).toHaveBeenLastCalledWith(expect.anything(), 1512, 1800, 170, 190);
      expect(screen.queryByTestId("challenge-prompt-stakes")).toBeNull();
      expect(screen.getByTestId("challenge-prompt-fallback")).toBeTruthy();

      // Tucked with Later and reopened: still no borrowed stakes for B.
      mockGetEloStakes.mockReturnValue(new Promise(() => undefined));
      screen.rerender(
        <ChallengePromptSheet challenge={null} busy={false} onAccept={jest.fn()} onDecline={jest.fn()} viewer={viewer} />,
      );
      screen.rerender(
        <ChallengePromptSheet challenge={B} busy={false} onAccept={jest.fn()} onDecline={jest.fn()} viewer={viewer} />,
      );
      expect(screen.queryByTestId("challenge-prompt-stakes")).toBeNull();
    },
  );

  it("reuses the stakes for a new challenge only when all four inputs match", async () => {
    mockGetEloStakes.mockResolvedValueOnce(STAKES);
    const viewer = { elo: 1512, weight: 170 };
    const screen = render(
      <ChallengePromptSheet challenge={RIVAL} busy={false} onAccept={jest.fn()} onDecline={jest.fn()} viewer={viewer} />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    mockGetEloStakes.mockReturnValue(new Promise(() => undefined));
    screen.rerender(
      <ChallengePromptSheet challenge={null} busy={false} onAccept={jest.fn()} onDecline={jest.fn()} viewer={viewer} />,
    );
    // Same rating and weight on both sides: the same stakes, by definition.
    screen.rerender(
      <ChallengePromptSheet
        challenge={{ ...RIVAL, challengeId: "ch-2" }}
        busy={false}
        onAccept={jest.fn()}
        onDecline={jest.fn()}
        viewer={viewer}
      />,
    );
    expect(screen.getByTestId("challenge-prompt-stakes-win")).toHaveTextContent("\u25b2 +14");
    // A different challenger weight: not reused.
    screen.rerender(
      <ChallengePromptSheet
        challenge={{ ...RIVAL, challengeId: "ch-3", challengerWeight: 220 }}
        busy={false}
        onAccept={jest.fn()}
        onDecline={jest.fn()}
        viewer={viewer}
      />,
    );
    expect(screen.queryByTestId("challenge-prompt-stakes")).toBeNull();
    // The viewer's weight changed: not reused either.
    screen.rerender(
      <ChallengePromptSheet
        challenge={{ ...RIVAL, challengeId: "ch-2" }}
        busy={false}
        onAccept={jest.fn()}
        onDecline={jest.fn()}
        viewer={{ elo: 1512, weight: 180 }}
      />,
    );
    expect(screen.queryByTestId("challenge-prompt-stakes")).toBeNull();
  });

  it("shows no strip (and never a spinner) without the viewer or when stakes fail", async () => {
    mockGetEloStakes.mockRejectedValue(new Error("offline"));
    const screen = render(<Harness challenge={RIVAL} />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockGetEloStakes).not.toHaveBeenCalled();
    expect(screen.queryByTestId("challenge-prompt-stakes")).toBeNull();
    expect(screen.getByText("Accept and you both drop straight into the match.")).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Sheet upgrade (spec 5, AC-S1..S7)
// ---------------------------------------------------------------------------

const NOW = Date.parse("2026-09-28T12:00:00.000Z");
const iso = (ms: number) => new Date(ms).toISOString();

function Sheet(props: Partial<React.ComponentProps<typeof ChallengePromptSheet>>) {
  return (
    <ChallengePromptSheet
      challenge={RIVAL}
      busy={false}
      onAccept={jest.fn()}
      onDecline={jest.fn()}
      {...props}
    />
  );
}

describe("ChallengePromptSheet freshness countdown (AC-S1)", () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
  });

  it("counts down m:ss to 10 minutes after createdAt, once a second", () => {
    // Created 78.5s ago: 8:41.5 left, which reads 8:42 (rounded up).
    const challenge = { ...RIVAL, createdAt: iso(NOW - 78_500), expiresAt: null };
    const screen = render(<Sheet challenge={challenge} />);
    expect(screen.getByTestId("challenge-prompt-countdown")).toHaveTextContent("8:42 LEFT");

    // Turns over on the second boundary, not a full second after mount.
    act(() => jest.advanceTimersByTime(500));
    expect(screen.getByTestId("challenge-prompt-countdown")).toHaveTextContent("8:41 LEFT");
    act(() => jest.advanceTimersByTime(1_000));
    expect(screen.getByTestId("challenge-prompt-countdown")).toHaveTextContent("8:40 LEFT");
    expect(screen.getByTestId("challenge-prompt-countdown").props.accessibilityLabel).toBe(
      "8 minutes 40 seconds left to answer",
    );
  });

  it("reads 10:00 for a challenge created this instant, and stops at 0:00", () => {
    const challenge = { ...RIVAL, createdAt: iso(NOW), expiresAt: null };
    const screen = render(<Sheet challenge={challenge} />);
    expect(screen.getByTestId("challenge-prompt-countdown")).toHaveTextContent("10:00 LEFT");
    act(() => jest.advanceTimersByTime(10 * 60_000 + 5_000));
    expect(screen.getByTestId("challenge-prompt-countdown")).toHaveTextContent("0:00 LEFT");
  });

  it("runs to expires_at when that is sooner than the 10-minute window", () => {
    const challenge = { ...RIVAL, createdAt: iso(NOW - 60_000), expiresAt: iso(NOW + 30_000) };
    const screen = render(<Sheet challenge={challenge} />);
    expect(screen.getByTestId("challenge-prompt-countdown")).toHaveTextContent("0:30 LEFT");
  });

  it("shows no countdown when neither timestamp is known", () => {
    const screen = render(<Sheet challenge={RIVAL} />);
    expect(screen.queryByTestId("challenge-prompt-countdown")).toBeNull();
  });

  it("restarts from the new challenge's createdAt when the prompt moves on", () => {
    const first = { ...RIVAL, createdAt: iso(NOW - 5 * 60_000), expiresAt: null };
    const second = { ...RIVAL, challengeId: "ch-2", createdAt: iso(NOW - 60_000), expiresAt: null };
    const screen = render(<Sheet challenge={first} />);
    expect(screen.getByTestId("challenge-prompt-countdown")).toHaveTextContent("5:00 LEFT");
    screen.rerender(<Sheet challenge={second} />);
    expect(screen.getByTestId("challenge-prompt-countdown")).toHaveTextContent("9:00 LEFT");
  });

  it("never commits the previous challenge's time for the next one", () => {
    // Records what each COMMIT shows (a layout effect runs after commit and
    // before passive effects), so a value only corrected by the countdown's
    // own effect would be caught here.
    const committed: string[] = [];
    function Probe({ challenge }: { challenge: IncomingChallenge }) {
      const remaining = useFreshCountdown(challenge);
      const text = remaining === null ? "none" : formatCountdown(remaining);
      React.useLayoutEffect(() => {
        committed.push(text);
      });
      return null;
    }
    const first = { ...RIVAL, createdAt: iso(NOW - 5 * 60_000), expiresAt: null };
    const second = { ...RIVAL, challengeId: "ch-2", createdAt: iso(NOW - 60_000), expiresAt: null };
    const screen = render(<Probe challenge={first} />);
    expect(committed).toEqual(["5:00"]);
    screen.rerender(<Probe challenge={second} />);
    expect(committed.slice(1)).not.toContain("5:00");
    expect(committed[committed.length - 1]).toBe("9:00");
  });

  it("leaves no timer running once the window has passed", () => {
    const challenge = { ...RIVAL, createdAt: iso(NOW - 9 * 60_000 - 58_000), expiresAt: null };
    const screen = render(<Sheet challenge={challenge} />);
    act(() => jest.advanceTimersByTime(5_000));
    expect(screen.getByTestId("challenge-prompt-countdown")).toHaveTextContent("0:00 LEFT");
    expect(jest.getTimerCount()).toBe(0);
  });

  it("ticks without re-rendering the rest of the sheet", () => {
    // The sheet's own render count is observed through the gorhom mock,
    // which re-renders whenever ChallengePromptSheet does.
    const challenge = { ...RIVAL, createdAt: iso(NOW), expiresAt: null };
    const before = mockSheetRenders;
    render(<Sheet challenge={challenge} />);
    act(() => jest.advanceTimersByTime(PROMPT_INPUT_GUARD_MS));
    const settled = mockSheetRenders;
    act(() => jest.advanceTimersByTime(5_000));
    expect(mockSheetRenders).toBe(settled);
    expect(settled).toBeGreaterThan(before);
  });
});

describe("ChallengePromptSheet header at large text sizes", () => {
  it("lets the label give way and caps font scaling so the countdown is never pushed off", () => {
    jest.useFakeTimers({ now: NOW });
    const challenge = { ...RIVAL, createdAt: iso(NOW), expiresAt: null };
    const screen = render(<Sheet challenge={challenge} />);
    const label = StyleSheet.flatten(screen.getByTestId("challenge-prompt-header-label").props.style);
    const trailing = StyleSheet.flatten(
      screen.getByTestId("challenge-prompt-header-trailing").props.style,
    );
    expect(label.flexShrink).toBe(1);
    expect(label.minWidth).toBe(0);
    expect(trailing.flexShrink).toBe(0);

    const countdown = screen.getByTestId("challenge-prompt-countdown");
    expect(countdown.props.maxFontSizeMultiplier).toBe(1.3);
    expect(countdown.props.numberOfLines).toBe(1);
    const title = screen.getByText("INCOMING CHALLENGE");
    expect(title.props.maxFontSizeMultiplier).toBe(1.3);
    expect(title.props.numberOfLines).toBe(1);
    // ink-3, not green: green means live status (the header chip).
    const light = paletteFor("light");
    expect(StyleSheet.flatten(title.props.style).color).toBe(light.text3);
    expect(light.text3).not.toBe(light.win);
    expect(screen.getByText("RANKED").props.maxFontSizeMultiplier).toBe(1.3);
  });

  it("caps every label on the non-scrolling sheet so Accept and Decline stay on screen", async () => {
    jest.useFakeTimers({ now: NOW });
    mockGetEloStakes.mockResolvedValue({
      challenger_win: 14,
      challenger_loss: -9,
      challenger_draw: -2,
    });
    const screen = render(<Sheet onLater={jest.fn()} moreCount={2} viewer={{ elo: 1512, weight: 170 }} />);
    await act(async () => {
      await Promise.resolve();
    });
    for (const id of [
      "challenge-prompt-decline-text",
      "challenge-prompt-accept-text",
      "challenge-prompt-later-text",
      "challenge-prompt-name",
      "challenge-prompt-meta",
      "challenge-prompt-subtitle",
      "challenge-prompt-more",
      "challenge-prompt-stakes-win",
      "challenge-prompt-stakes-loss",
    ]) {
      const el = screen.getByTestId(id);
      expect([id, el.props.maxFontSizeMultiplier]).toEqual([id, 1.3]);
      expect([id, el.props.numberOfLines]).toEqual([id, 1]);
    }
    expect(screen.getByText("YOUR STAKES \u00b7 1512").props.maxFontSizeMultiplier).toBe(1.3);
    // The initials block is hidden from accessibility, so query past that.
    const initials = screen.getByText("R", { includeHiddenElements: true });
    expect(initials.props.maxFontSizeMultiplier).toBe(1.3);
  });

  it("caps the fallback line too", () => {
    const screen = render(<Sheet />);
    expect(screen.getByTestId("challenge-prompt-fallback").props.maxFontSizeMultiplier).toBe(1.3);
  });
});

describe("ChallengePromptSheet buttons (AC-S2)", () => {
  it("are 56pt, Decline 1/3 outline and Accept 2/3 in Signal Red, keeping the harness labels", () => {
    const screen = render(<Sheet />);
    const decline = StyleSheet.flatten(screen.getByTestId("challenge-prompt-decline").props.style);
    const accept = StyleSheet.flatten(screen.getByTestId("challenge-prompt-accept").props.style);

    expect(decline.height).toBe(56);
    expect(accept.height).toBe(56);
    expect(decline.flex).toBe(1);
    expect(accept.flex).toBe(2);
    expect(decline.borderWidth).toBe(1);
    // A true outline: no fill at rest.
    expect(decline.backgroundColor).toBe("transparent");
    expect(accept.backgroundColor).toBe("#E63946");

    expect(screen.getByTestId("challenge-prompt-accept").props.accessibilityLabel).toBe(
      "Accept challenge",
    );
    expect(screen.getByTestId("challenge-prompt-decline").props.accessibilityLabel).toBe(
      "Decline challenge",
    );
    // Visible copy per spec 5 (uppercased by the class); the label above is
    // what VoiceOver and the harness use.
    expect(screen.getByTestId("challenge-prompt-accept-text")).toHaveTextContent("Accept", { exact: true });
    expect(screen.getByTestId("challenge-prompt-decline-text")).toHaveTextContent("Decline", { exact: true });
  });
});

describe("ChallengePromptSheet input guard (AC-S3)", () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
  });

  it("ignores Accept, Decline and Later for 600ms after the prompt appears", () => {
    const onAccept = jest.fn();
    const onDecline = jest.fn();
    const onLater = jest.fn();
    const screen = render(
      <Sheet onAccept={onAccept} onDecline={onDecline} onLater={onLater} />,
    );

    fireEvent.press(screen.getByLabelText("Accept challenge"));
    fireEvent.press(screen.getByLabelText("Decline challenge"));
    fireEvent.press(screen.getByLabelText("Later"));
    act(() => jest.advanceTimersByTime(PROMPT_INPUT_GUARD_MS - 1));
    fireEvent.press(screen.getByLabelText("Accept challenge"));
    expect(onAccept).not.toHaveBeenCalled();
    expect(onDecline).not.toHaveBeenCalled();
    expect(onLater).not.toHaveBeenCalled();

    // A swallowed tap is dropped, not queued.
    act(() => jest.advanceTimersByTime(1));
    expect(onAccept).not.toHaveBeenCalled();

    fireEvent.press(screen.getByLabelText("Accept challenge"));
    expect(onAccept).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByLabelText("Decline challenge"));
    expect(onDecline).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByLabelText("Later"));
    expect(onLater).toHaveBeenCalledTimes(1);
  });

  it("is not restarted by a re-render of the same challenge", () => {
    const onAccept = jest.fn();
    const screen = render(<Sheet onAccept={onAccept} />);
    act(() => jest.advanceTimersByTime(400));
    screen.rerender(<Sheet challenge={{ ...RIVAL }} onAccept={onAccept} />);
    act(() => jest.advanceTimersByTime(200));
    fireEvent.press(screen.getByLabelText("Accept challenge"));
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it("re-arms when the prompt reappears (reopened from the chip, or the next challenge)", () => {
    const onAccept = jest.fn();
    const screen = render(<Sheet onAccept={onAccept} />);
    act(() => jest.advanceTimersByTime(5_000));

    // Tucked away with Later, then brought back up from the chip.
    screen.rerender(<Sheet challenge={null} onAccept={onAccept} />);
    screen.rerender(<Sheet challenge={RIVAL} onAccept={onAccept} />);
    fireEvent.press(screen.getByLabelText("Accept challenge"));
    expect(onAccept).not.toHaveBeenCalled();

    act(() => jest.advanceTimersByTime(PROMPT_INPUT_GUARD_MS));
    // The next challenge replaces this one in place.
    screen.rerender(<Sheet challenge={{ ...RIVAL, challengeId: "ch-2" }} onAccept={onAccept} />);
    fireEvent.press(screen.getByLabelText("Accept challenge"));
    expect(onAccept).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(PROMPT_INPUT_GUARD_MS));
    fireEvent.press(screen.getByLabelText("Accept challenge"));
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it("disables the buttons for the guard, so a dropped tap shows no pressed state", () => {
    const screen = render(<Sheet onLater={jest.fn()} />);
    for (const id of ["challenge-prompt-accept", "challenge-prompt-decline", "challenge-prompt-later"]) {
      expect(screen.getByTestId(id).props.accessibilityState).toMatchObject({ disabled: true });
    }
    act(() => jest.advanceTimersByTime(PROMPT_INPUT_GUARD_MS));
    for (const id of ["challenge-prompt-accept", "challenge-prompt-decline", "challenge-prompt-later"]) {
      expect(screen.getByTestId(id).props.accessibilityState).toMatchObject({ disabled: false });
    }
  });

  it("runs exactly 600ms from present(), not restarted when the sheet settles (AC-S3)", () => {
    const onAccept = jest.fn();
    const screen = render(<Sheet onAccept={onAccept} />);
    // The present animation takes a while; the sheet settles at 400ms. The
    // signed-off AC-S3 counts from the sheet appearing, so the settle does
    // not buy another 600ms.
    act(() => jest.advanceTimersByTime(400));
    act(() => mockOnChange?.(0));
    act(() => jest.advanceTimersByTime(PROMPT_INPUT_GUARD_MS - 400 - 1));
    fireEvent.press(screen.getByLabelText("Accept challenge"));
    expect(onAccept).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(1));
    expect(screen.getByTestId("challenge-prompt-accept").props.accessibilityState).toMatchObject({
      disabled: false,
    });
    fireEvent.press(screen.getByLabelText("Accept challenge"));
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it("does not re-arm when the sheet settles after the first window already ran out", () => {
    // A slow present or a busy JS thread: the settle arrives 700ms in.
    const onAccept = jest.fn();
    const screen = render(<Sheet onAccept={onAccept} />);
    act(() => jest.advanceTimersByTime(PROMPT_INPUT_GUARD_MS + 100));
    expect(screen.getByTestId("challenge-prompt-accept").props.accessibilityState).toMatchObject({
      disabled: false,
    });
    act(() => mockOnChange?.(0));
    // Enabled stays enabled: no flip back to disabled, and the tap lands.
    expect(screen.getByTestId("challenge-prompt-accept").props.accessibilityState).toMatchObject({
      disabled: false,
    });
    fireEvent.press(screen.getByLabelText("Accept challenge"));
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it("does not re-arm at a later snap when a challenge replaces another in place", () => {
    // Decline A with B queued: B replaces A on a sheet that is already
    // settled at index 0, so gorhom fires no onChange for B's appearance.
    const onAccept = jest.fn();
    const screen = render(<Sheet onAccept={onAccept} />);
    act(() => mockOnChange?.(0));
    act(() => jest.advanceTimersByTime(PROMPT_INPUT_GUARD_MS));

    screen.rerender(<Sheet challenge={{ ...RIVAL, challengeId: "ch-2" }} onAccept={onAccept} />);
    // B still gets its full guard from the swap.
    fireEvent.press(screen.getByLabelText("Accept challenge"));
    expect(onAccept).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(PROMPT_INPUT_GUARD_MS + 100));

    // A later snap (say, the stakes strip resizing the sheet) must not
    // restart the guard and drop a deliberate tap.
    act(() => mockOnChange?.(0));
    expect(screen.getByTestId("challenge-prompt-accept").props.accessibilityState).toMatchObject({
      disabled: false,
    });
    fireEvent.press(screen.getByLabelText("Accept challenge"));
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it("gives a challenge that replaces another before the settle its own 600ms from the swap", () => {
    const onAccept = jest.fn();
    const screen = render(<Sheet onAccept={onAccept} />);
    act(() => jest.advanceTimersByTime(200));
    screen.rerender(<Sheet challenge={{ ...RIVAL, challengeId: "ch-2" }} onAccept={onAccept} />);
    act(() => jest.advanceTimersByTime(200));
    act(() => mockOnChange?.(0));
    act(() => jest.advanceTimersByTime(PROMPT_INPUT_GUARD_MS - 200 - 1));
    fireEvent.press(screen.getByLabelText("Accept challenge"));
    expect(onAccept).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(1));
    fireEvent.press(screen.getByLabelText("Accept challenge"));
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it("still gates by the appearance time when busy clears inside the window", () => {
    const onAccept = jest.fn();
    const screen = render(<Sheet busy onAccept={onAccept} />);
    act(() => jest.advanceTimersByTime(300));
    screen.rerender(<Sheet busy={false} onAccept={onAccept} />);
    fireEvent.press(screen.getByLabelText("Accept challenge"));
    expect(onAccept).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(PROMPT_INPUT_GUARD_MS - 300));
    fireEvent.press(screen.getByLabelText("Accept challenge"));
    expect(onAccept).toHaveBeenCalledTimes(1);
  });
});

describe("ChallengePromptSheet Later (AC-S4, AC-S7)", () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
  });

  it("is an explicit text button that answers nothing", () => {
    const onAccept = jest.fn();
    const onDecline = jest.fn();
    const onLater = jest.fn();
    const screen = render(
      <Sheet onAccept={onAccept} onDecline={onDecline} onLater={onLater} />,
    );
    act(() => jest.advanceTimersByTime(PROMPT_INPUT_GUARD_MS));

    fireEvent.press(screen.getByRole("button", { name: "Later" }));
    expect(onLater).toHaveBeenCalledTimes(1);
    expect(onAccept).not.toHaveBeenCalled();
    expect(onDecline).not.toHaveBeenCalled();
  });

  it("disables Accept, Decline and Later while an answer is in flight, past the guard", () => {
    const onAccept = jest.fn();
    const onDecline = jest.fn();
    const onLater = jest.fn();
    const screen = render(<Sheet busy onAccept={onAccept} onDecline={onDecline} onLater={onLater} />);
    act(() => jest.advanceTimersByTime(PROMPT_INPUT_GUARD_MS + 100));
    for (const id of ["challenge-prompt-accept", "challenge-prompt-decline", "challenge-prompt-later"]) {
      const button = screen.getByTestId(id);
      expect(button.props.accessibilityState).toMatchObject({ disabled: true });
      fireEvent.press(button);
    }
    // No double accept or decline while a write is in flight.
    expect(onAccept).not.toHaveBeenCalled();
    expect(onDecline).not.toHaveBeenCalled();
    expect(onLater).not.toHaveBeenCalled();
  });

  it("is absent when the owner offers no Later", () => {
    const screen = render(<Sheet />);
    expect(screen.queryByTestId("challenge-prompt-later")).toBeNull();
  });

  it("cannot be swiped closed", () => {
    render(<Sheet onLater={jest.fn()} />);
    expect(mockSheetProps.enablePanDownToClose).toBe(false);
  });
});

describe("ChallengePromptSheet multiple incoming (AC-S6)", () => {
  it("shows the first challenge plus a +N more line", () => {
    const screen = render(<Sheet moreCount={2} />);
    expect(screen.getByTestId("challenge-prompt-more")).toHaveTextContent("+2 more", { exact: true });
    // Still one challenge on the sheet.
    expect(screen.getAllByLabelText("Accept challenge")).toHaveLength(1);
  });

  it("uses the spec's exact copy for one more", () => {
    const screen = render(<Sheet moreCount={1} />);
    expect(screen.getByTestId("challenge-prompt-more")).toHaveTextContent("+1 more", { exact: true });
  });

  it("says nothing when this is the only one", () => {
    const screen = render(<Sheet moreCount={0} />);
    expect(screen.queryByTestId("challenge-prompt-more")).toBeNull();
  });
});
