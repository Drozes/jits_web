/**
 * The live incoming challenge prompt (`ChallengePromptSheet`). Covers:
 *
 *  - the centered modal (jits-02vo.3, board P-Challenge-Sheet): shown only
 *    while there is a challenge, 16pt side insets, 75% of the window tall
 *    (clamped inside the safe area), radius 8, dimmed backdrop, content that
 *    scrolls inside the card rather than clipping the actions;
 *  - non-dismissable (AC-S7): a backdrop tap and Android back do nothing;
 *  - the present watchdog: a present iOS refused is retried, and the retry's
 *    real appearance gets its own input guard;
 *  - accessibility (jits-ef2a): the buttons stay reachable by label;
 *  - the Warning haptic (jits-4zp.7) and the stakes preview (with its cache
 *    across a Later and reopen);
 *  - the prompt upgrade (spec 5): countdown AC-S1, buttons AC-S2, input guard
 *    AC-S3 (including a challenge replaced in place), Later AC-S4/AC-S7,
 *    "+N more" AC-S6, and the Dynamic Type caps;
 *  - feedback over the prompt: toasts and the offline banner render inside
 *    the Modal while it is up (a Modal is presented above the root hosts),
 *    and go back to the root host once it clears;
 *  - a focused field's keyboard is dismissed when a challenge appears.
 */
import * as React from "react";
import { act, fireEvent, render, within } from "@testing-library/react-native";
import { Keyboard, Modal, ScrollView, StyleSheet } from "react-native";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";

const mockNotify = jest.fn((_type: unknown) => Promise.resolve());
jest.mock("expo-haptics", () => ({
  notificationAsync: (t: unknown) => mockNotify(t),
  NotificationFeedbackType: { Success: "success", Warning: "warning", Error: "error" },
}));

jest.mock("@/lib/theme/use-theme", () => ({
  useResolvedColorScheme: () => "light",
  useThemedTokens: () => ({ bgSecondary: "#13151B", textTertiary: "#8D929D" }),
}));

// The offline banner mounted inside the prompt reads NetInfo. Online unless
// a test says otherwise.
let mockNetState: { isConnected: boolean } = { isConnected: true };
jest.mock("@react-native-community/netinfo", () => ({
  __esModule: true,
  default: {
    fetch: async () => mockNetState,
    addEventListener: (cb: (s: { isConnected: boolean }) => void) => {
      cb(mockNetState);
      return () => undefined;
    },
  },
}));

jest.mock("@/lib/supabase/client", () => ({ supabase: { tag: "client" } }));

const mockGetEloStakes = jest.fn();
jest.mock("@jits/shared/api/queries", () => ({
  getEloStakes: (...args: unknown[]) => mockGetEloStakes(...args),
}));

// The window the prompt sizes itself against. Default: iPhone 14/15 (844pt).
let mockWindow = { width: 390, height: 844, scale: 3, fontScale: 1 };
jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: () => mockWindow,
}));

// The present watchdog, stubbed so a suite on fake timers is not remounted
// every 1.5s by a Modal mock that never fires onShow. `useRealWatchdog`
// switches one test to the real hook.
let mockWatchdogKey = 0;
const mockWatchdogOnShow = jest.fn();
let mockUseRealWatchdog = false;
jest.mock("@/lib/updates/use-modal-present-watchdog", () => {
  const actual = jest.requireActual("@/lib/updates/use-modal-present-watchdog");
  return {
    ...actual,
    useModalPresentWatchdog: (visible: boolean) =>
      mockUseRealWatchdog
        ? actual.useModalPresentWatchdog(visible)
        : { modalKey: mockWatchdogKey, onShow: mockWatchdogOnShow },
  };
});

// Counts renders of the prompt body (not the countdown line).
let mockBodyRenders = 0;
jest.mock("@/components/match-flow/fight/fight-ui", () => {
  const actual = jest.requireActual("@/components/match-flow/fight/fight-ui");
  return {
    ...actual,
    InitialsBlock: (props: Record<string, unknown>) => {
      mockBodyRenders += 1;
      return actual.InitialsBlock(props);
    },
  };
});

import {
  ChallengePromptSheet,
  PROMPT_BACKDROP,
  promptCardHeight,
} from "@/components/arena/challenge-prompt-sheet";
import { PROMPT_INPUT_GUARD_MS } from "@/lib/arena/constants";
import { ModalToaster, Toaster, __resetToastTrackingForTests, toast } from "@/components/ui/toast";
import { __resetServerClockForTests } from "@/lib/arena/incoming-challenges";
import { formatCountdown, useFreshCountdown } from "@/lib/arena/fresh-countdown";
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

type Screen = ReturnType<typeof render>;
const modalOf = (screen: Screen) => screen.UNSAFE_getByType(Modal);

beforeEach(() => {
  mockGetEloStakes.mockReset();
  mockGetEloStakes.mockResolvedValue(null);
  mockNotify.mockClear();
  mockWatchdogOnShow.mockClear();
  mockWatchdogKey = 0;
  mockUseRealWatchdog = false;
  mockWindow = { width: 390, height: 844, scale: 3, fontScale: 1 };
  mockNetState = { isConnected: true };
  __resetServerClockForTests();
  __resetToastTrackingForTests();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("ChallengePromptSheet centered modal (jits-02vo.3)", () => {
  it("is not shown without a challenge (every launch)", () => {
    const screen = render(<Harness challenge={null} />);
    expect(modalOf(screen).props.visible).toBe(false);
    expect(screen.queryByTestId("challenge-prompt")).toBeNull();
  });

  it("shows for a challenge and hides once it is answered or withdrawn", () => {
    const screen = render(<Harness challenge={null} />);
    screen.rerender(<Harness challenge={RIVAL} />);
    expect(modalOf(screen).props.visible).toBe(true);
    expect(screen.getByTestId("challenge-prompt")).toBeTruthy();

    screen.rerender(<Harness challenge={null} />);
    expect(modalOf(screen).props.visible).toBe(false);

    // And comes back for the next one.
    screen.rerender(<Harness challenge={{ ...RIVAL, challengeId: "ch-2" }} />);
    expect(modalOf(screen).props.visible).toBe(true);
  });

  it("is a transparent, fading modal over the status bar", () => {
    const screen = render(<Harness challenge={RIVAL} />);
    const modal = modalOf(screen);
    expect(modal.props.transparent).toBe(true);
    expect(modal.props.animationType).toBe("fade");
    expect(modal.props.statusBarTranslucent).toBe(true);
  });

  it("dims the screen behind with a backdrop and insets the card 16pt from each side", () => {
    const screen = render(<Harness challenge={RIVAL} />);
    const backdrop = StyleSheet.flatten(screen.getByTestId("challenge-prompt-backdrop").props.style);
    expect(backdrop.backgroundColor).toBe(PROMPT_BACKDROP);
    expect(PROMPT_BACKDROP).toBe("rgba(0,0,0,0.55)");
    expect(backdrop.flex).toBe(1);
    expect(backdrop.justifyContent).toBe("center");
    expect(backdrop.paddingHorizontal).toBe(16);

    const card = StyleSheet.flatten(screen.getByTestId("challenge-prompt-card").props.style);
    expect(card.borderRadius).toBe(8);
    expect(card.borderWidth).toBe(1);
    const light = paletteFor("light");
    expect(card.backgroundColor).toBe(light.plate);
    expect(card.borderColor).toBe(light.strong);
    expect(card.overflow).toBe("hidden");
  });

  it.each([
    ["iPhone 14/15 (the board)", 844, { top: 47, bottom: 34 }, 633],
    ["iPhone SE", 667, { top: 20, bottom: 0 }, 500],
    ["iPhone Pro Max", 932, { top: 59, bottom: 34 }, 699],
  ])("is 75%% of the window tall on an %s", (_label, height, insets, expected) => {
    mockWindow = { width: 390, height, scale: 3, fontScale: 1 };
    const screen = render(
      <SafeAreaInsetsContext.Provider value={{ ...insets, left: 0, right: 0 }}>
        <Harness challenge={RIVAL} />
      </SafeAreaInsetsContext.Provider>,
    );
    const card = StyleSheet.flatten(screen.getByTestId("challenge-prompt-card").props.style);
    expect(card.height).toBe(expected);
  });

  it("never runs the card under the status bar or home indicator on a short window", () => {
    // 75% of 400 is 300, but only 400 - 40 - 80 - 32 = 248 fits.
    expect(promptCardHeight(400, { top: 40, bottom: 80 })).toBe(248);
    expect(promptCardHeight(844, { top: 47, bottom: 34 })).toBe(633);
    expect(promptCardHeight(20, { top: 40, bottom: 40 })).toBe(0);
  });

  it("works without a safe area provider", () => {
    const screen = render(<Harness challenge={RIVAL} />);
    expect(StyleSheet.flatten(screen.getByTestId("challenge-prompt-card").props.style).height).toBe(633);
  });

  it("centers the content, and scrolls it inside the card on a small phone instead of clipping", () => {
    const screen = render(<Harness challenge={RIVAL} />);
    const scroll = screen.UNSAFE_getByType(ScrollView);
    expect(scroll.props.testID).toBe("challenge-prompt-scroll");
    const content = StyleSheet.flatten(scroll.props.contentContainerStyle);
    // flexGrow (not flex): centered while it fits, scrollable once it does
    // not, so Accept and Decline are always reachable.
    expect(content.flexGrow).toBe(1);
    expect(content.justifyContent).toBe("center");
    expect(content.paddingHorizontal).toBe(16);
    expect(content.paddingVertical).toBe(24);
    expect(scroll.props.bounces).toBe(false);
    // Actions live inside the scrolling content.
    expect(screen.getByTestId("challenge-prompt-scroll")).toContainElement(
      screen.getByTestId("challenge-prompt-accept"),
    );
  });

  it("keeps the board's content order", () => {
    mockGetEloStakes.mockResolvedValue(undefined);
    const screen = render(
      <ChallengePromptSheet
        challenge={RIVAL}
        busy={false}
        onAccept={jest.fn()}
        onDecline={jest.fn()}
        onLater={jest.fn()}
      />,
    );
    const ids = [
      "challenge-prompt-title",
      "challenge-prompt-name",
      "challenge-prompt-meta",
      "challenge-prompt-subtitle",
      "challenge-prompt-fallback",
      "challenge-prompt-decline",
      "challenge-prompt-accept",
      "challenge-prompt-later",
    ];
    type Node = { props: { testID?: unknown }; type: unknown };
    const all: Node[] = screen.UNSAFE_root.findAll(
      (n: Node) => typeof n.props.testID === "string" && typeof n.type !== "string",
    );
    const order = ids.map((id) => all.findIndex((n) => n.props.testID === id));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(screen.getByTestId("challenge-prompt-meta")).toHaveTextContent("ELO 1350 · 190 LBS");
  });

  it("keeps the last card on screen while it fades out, with its answers disabled", async () => {
    jest.useFakeTimers();
    mockGetEloStakes.mockResolvedValue({ challenger_win: 14, challenger_loss: -9, challenger_draw: -2 });
    const viewer = { elo: 1512, weight: 170 };
    const onAccept = jest.fn();
    const screen = render(
      <ChallengePromptSheet challenge={RIVAL} busy={false} onAccept={onAccept} onDecline={jest.fn()} viewer={viewer} moreCount={1} />,
    );
    await act(async () => {
      await Promise.resolve();
    });
    act(() => jest.advanceTimersByTime(PROMPT_INPUT_GUARD_MS));
    expect(screen.getByTestId("challenge-prompt-stakes")).toBeTruthy();

    // RN keeps rendering a Modal's children through its dismiss animation.
    // The jest Modal mock drops them at visible=false, so render the
    // children it was handed on their own, as the real one keeps them.
    screen.rerender(
      <ChallengePromptSheet challenge={null} busy={false} onAccept={onAccept} onDecline={jest.fn()} viewer={viewer} moreCount={1} />,
    );
    const modal = modalOf(screen);
    expect(modal.props.visible).toBe(false);
    // The fading card is hidden from the accessibility tree (see the
    // fade-out accessibility suite), so query hidden elements here.
    const { getByTestId, queryByTestId } = render(<>{modal.props.children}</>);
    const hidden = { includeHiddenElements: true };
    expect(getByTestId("challenge-prompt-name", hidden)).toHaveTextContent("Rival");
    expect(getByTestId("challenge-prompt-stakes", hidden)).toBeTruthy();
    expect(queryByTestId("challenge-prompt-fallback", hidden)).toBeNull();
    expect(getByTestId("challenge-prompt-more", hidden)).toHaveTextContent("+1 more");
    expect(getByTestId("challenge-prompt-accept", hidden).props.accessibilityState).toMatchObject({ disabled: true });
    fireEvent.press(getByTestId("challenge-prompt-accept", hidden));
    expect(onAccept).not.toHaveBeenCalled();
  });
});

describe("ChallengePromptSheet cannot be dismissed by accident (AC-S7)", () => {
  it("ignores Android back and the iOS close request", () => {
    jest.useFakeTimers();
    const onAccept = jest.fn();
    const onDecline = jest.fn();
    const onLater = jest.fn();
    const screen = render(
      <ChallengePromptSheet challenge={RIVAL} busy={false} onAccept={onAccept} onDecline={onDecline} onLater={onLater} />,
    );
    act(() => jest.advanceTimersByTime(PROMPT_INPUT_GUARD_MS));
    const onRequestClose = modalOf(screen).props.onRequestClose as () => void;
    expect(typeof onRequestClose).toBe("function");
    act(() => onRequestClose());
    expect(modalOf(screen).props.visible).toBe(true);
    expect(onAccept).not.toHaveBeenCalled();
    expect(onDecline).not.toHaveBeenCalled();
    expect(onLater).not.toHaveBeenCalled();
  });

  it("does nothing on a backdrop tap", () => {
    jest.useFakeTimers();
    const onAccept = jest.fn();
    const onDecline = jest.fn();
    const onLater = jest.fn();
    const screen = render(
      <ChallengePromptSheet challenge={RIVAL} busy={false} onAccept={onAccept} onDecline={onDecline} onLater={onLater} />,
    );
    act(() => jest.advanceTimersByTime(PROMPT_INPUT_GUARD_MS));
    const backdrop = screen.getByTestId("challenge-prompt-backdrop");
    // A plain View: nothing to press, not a button.
    expect(backdrop.props.onPress).toBeUndefined();
    expect(backdrop.props.accessibilityRole).toBeUndefined();
    fireEvent.press(backdrop);
    expect(modalOf(screen).props.visible).toBe(true);
    expect(onAccept).not.toHaveBeenCalled();
    expect(onDecline).not.toHaveBeenCalled();
    expect(onLater).not.toHaveBeenCalled();
  });
});

describe("ChallengePromptSheet present watchdog", () => {
  it("re-arms the input guard when a refused present is retried and really shows", () => {
    jest.useFakeTimers();
    const onAccept = jest.fn();
    const props = { busy: false, onAccept, onDecline: jest.fn() };
    const screen = render(<ChallengePromptSheet challenge={RIVAL} {...props} />);
    act(() => jest.advanceTimersByTime(PROMPT_INPUT_GUARD_MS));

    // iOS refused the present; the watchdog remounted the Modal and it is
    // only now really on screen.
    mockWatchdogKey = 1;
    screen.rerender(<ChallengePromptSheet challenge={{ ...RIVAL }} {...props} />);
    act(() => (modalOf(screen).props.onShow as () => void)());
    expect(mockWatchdogOnShow).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("challenge-prompt-accept").props.accessibilityState).toEqual({ disabled: true });
    fireEvent.press(screen.getByTestId("challenge-prompt-accept"));
    expect(onAccept).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(PROMPT_INPUT_GUARD_MS));
    fireEvent.press(screen.getByTestId("challenge-prompt-accept"));
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it("does not restart the guard on an ordinary onShow", () => {
    jest.useFakeTimers();
    const onAccept = jest.fn();
    const screen = render(<ChallengePromptSheet challenge={RIVAL} busy={false} onAccept={onAccept} onDecline={jest.fn()} />);
    // The fade-in settles at 300ms: that does not buy another 600ms.
    act(() => jest.advanceTimersByTime(300));
    act(() => (modalOf(screen).props.onShow as () => void)());
    act(() => jest.advanceTimersByTime(PROMPT_INPUT_GUARD_MS - 300));
    fireEvent.press(screen.getByTestId("challenge-prompt-accept"));
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it("remounts a Modal iOS never presented, and stops once it shows (real hook)", () => {
    jest.useFakeTimers();
    mockUseRealWatchdog = true;
    const screen = render(<Harness challenge={RIVAL} />);
    const first = modalOf(screen);
    act(() => jest.advanceTimersByTime(1_600));
    const second = modalOf(screen);
    expect(second).not.toBe(first);
    act(() => (second.props.onShow as () => void)());
    act(() => jest.advanceTimersByTime(10_000));
    expect(modalOf(screen)).toBe(second);
  });
});

describe("ChallengePromptSheet accessibility (jits-ef2a)", () => {
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
    expect(getByTestId("challenge-prompt-card").props.accessible).not.toBe(true);
    expect(getByTestId("challenge-prompt-backdrop").props.accessible).not.toBe(true);
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
    const screen = render(<Harness challenge={RIVAL} />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(modalOf(screen).props.visible).toBe(true);
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
    expect(screen.queryByText("RANKED")).toBeNull();
    expect(screen.getByText("Rival is live in the Arena")).toBeTruthy();
  });

  it("keeps the stakes across a Later and reopen, so the strip does not flicker", async () => {
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
    // Well past 0:00 (and past the in-modal toast host's own mount timer),
    // a countdown still ticking once a second would leave a timer here.
    act(() => jest.advanceTimersByTime(60_000));
    expect(jest.getTimerCount()).toBe(0);
  });

  it("ticks without re-rendering the rest of the prompt", () => {
    // The body's render count is observed through the InitialsBlock mock,
    // which re-renders whenever the prompt body does.
    const challenge = { ...RIVAL, createdAt: iso(NOW), expiresAt: null };
    const before = mockBodyRenders;
    render(<Sheet challenge={challenge} />);
    act(() => jest.advanceTimersByTime(PROMPT_INPUT_GUARD_MS));
    const settled = mockBodyRenders;
    act(() => jest.advanceTimersByTime(5_000));
    expect(mockBodyRenders).toBe(settled);
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
  });

  it("caps every label on the prompt so Accept and Decline keep their size", async () => {
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

  it("runs exactly 600ms from the appearance, not restarted when the fade-in settles (AC-S3)", () => {
    const onAccept = jest.fn();
    const screen = render(<Sheet onAccept={onAccept} />);
    // The fade-in takes a while; onShow lands at 400ms. The signed-off AC-S3
    // counts from the prompt appearing, so the settle does not buy another
    // 600ms.
    act(() => jest.advanceTimersByTime(400));
    act(() => (modalOf(screen).props.onShow as () => void)());
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

  it("does not re-arm when onShow lands after the first window already ran out", () => {
    // A slow present or a busy JS thread: the settle arrives 700ms in.
    const onAccept = jest.fn();
    const screen = render(<Sheet onAccept={onAccept} />);
    act(() => jest.advanceTimersByTime(PROMPT_INPUT_GUARD_MS + 100));
    expect(screen.getByTestId("challenge-prompt-accept").props.accessibilityState).toMatchObject({
      disabled: false,
    });
    act(() => (modalOf(screen).props.onShow as () => void)());
    // Enabled stays enabled: no flip back to disabled, and the tap lands.
    expect(screen.getByTestId("challenge-prompt-accept").props.accessibilityState).toMatchObject({
      disabled: false,
    });
    fireEvent.press(screen.getByLabelText("Accept challenge"));
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it("does not re-arm at a later onShow when a challenge replaces another in place", () => {
    // Decline A with B queued: B replaces A on a modal that is already
    // shown, so no onShow fires for B's appearance.
    const onAccept = jest.fn();
    const screen = render(<Sheet onAccept={onAccept} />);
    act(() => (modalOf(screen).props.onShow as () => void)());
    act(() => jest.advanceTimersByTime(PROMPT_INPUT_GUARD_MS));

    screen.rerender(<Sheet challenge={{ ...RIVAL, challengeId: "ch-2" }} onAccept={onAccept} />);
    // B still gets its full guard from the swap.
    fireEvent.press(screen.getByLabelText("Accept challenge"));
    expect(onAccept).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(PROMPT_INPUT_GUARD_MS + 100));

    // A stray later onShow must not restart the guard and drop a
    // deliberate tap.
    act(() => (modalOf(screen).props.onShow as () => void)());
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
    act(() => (modalOf(screen).props.onShow as () => void)());
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

  it("minimizing is only ever the Later button: the modal itself never closes", () => {
    const screen = render(<Sheet onLater={jest.fn()} />);
    act(() => (modalOf(screen).props.onRequestClose as () => void)());
    expect(modalOf(screen).props.visible).toBe(true);
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

describe("ChallengePromptSheet feedback over the prompt", () => {
  // The app's root host, as app/_layout.tsx mounts it, beside the prompt.
  function App({ challenge }: { challenge: IncomingChallenge | null }) {
    return (
      <>
        <Toaster />
        <Harness challenge={challenge} />
      </>
    );
  }

  it("renders a toast raised while the prompt is up inside the Modal, over the card", () => {
    const screen = render(<App challenge={RIVAL} />);
    act(() => toast.error("Couldn't decline that challenge. Try again."));
    const inModal = within(modalOf(screen)).getAllByText("Couldn't decline that challenge. Try again.");
    expect(inModal).toHaveLength(1);
    // Only the prompt's host took it: the root host, under the Modal, did not.
    expect(screen.getAllByText("Couldn't decline that challenge. Try again.")).toHaveLength(1);
    act(() => toast.hide());
  });

  it("hands toasts back to the root host once the prompt clears", () => {
    const screen = render(<App challenge={RIVAL} />);
    screen.rerender(<App challenge={null} />);
    act(() => toast.info("Rival just left the Arena"));
    expect(screen.getAllByText("Rival just left the Arena")).toHaveLength(1);
    expect(within(modalOf(screen)).queryByText("Rival just left the Arena")).toBeNull();
    act(() => toast.hide());
  });

  it("keeps a toast raised in the same flow that clears the prompt, on the root host", () => {
    // A failed Accept: the hook toasts, then clears the prompt, in one batch.
    // The toast first lands on the in-modal host, which unmounts right after.
    jest.useFakeTimers();
    const onHide = jest.fn();
    const screen = render(<App challenge={RIVAL} />);
    act(() => {
      toast.error({ text1: "That challenge is no longer available.", onHide });
      screen.rerender(<App challenge={null} />);
    });
    act(() => jest.advanceTimersByTime(0));
    expect(screen.getAllByText("That challenge is no longer available.")).toHaveLength(1);
    expect(within(modalOf(screen)).queryByText("That challenge is no longer available.")).toBeNull();
    // The root host auto-hides it on the usual schedule, calling the owner's onHide.
    act(() => jest.advanceTimersByTime(3900));
    expect(onHide).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(200));
    expect(onHide).toHaveBeenCalledTimes(1);
  });

  it("keeps a toast raised just before the prompt clears, for the rest of its window", () => {
    jest.useFakeTimers();
    const onHide = jest.fn();
    const screen = render(<App challenge={RIVAL} />);
    act(() => toast.error({ text1: "Couldn't accept that challenge.", onHide }));
    act(() => jest.advanceTimersByTime(1500));
    screen.rerender(<App challenge={null} />);
    act(() => jest.advanceTimersByTime(0));
    expect(screen.getAllByText("Couldn't accept that challenge.")).toHaveLength(1);
    expect(within(modalOf(screen)).queryByText("Couldn't accept that challenge.")).toBeNull();
    // Only the 2.5s left of its 4s window, not a fresh 4s.
    act(() => jest.advanceTimersByTime(2400));
    expect(onHide).not.toHaveBeenCalled();
    act(() => jest.advanceTimersByTime(200));
    expect(onHide).toHaveBeenCalledTimes(1);
  });

  it("does not bring back a toast that already hid, or one the root host already shows", () => {
    jest.useFakeTimers();
    const screen = render(<App challenge={null} />);
    // Raised before the prompt: the root host owns it and keeps it.
    act(() => toast.info("Rival just left the Arena"));
    screen.rerender(<App challenge={RIVAL} />);
    screen.rerender(<App challenge={null} />);
    act(() => jest.advanceTimersByTime(0));
    expect(screen.getAllByText("Rival just left the Arena")).toHaveLength(1);
    act(() => toast.hide());

    // Raised on the prompt and dismissed before it clears: stays gone.
    screen.rerender(<App challenge={RIVAL} />);
    act(() => toast.error("Couldn't decline that challenge. Try again."));
    act(() => toast.hide());
    screen.rerender(<App challenge={null} />);
    act(() => jest.advanceTimersByTime(0));
    expect(screen.queryByText("Couldn't decline that challenge. Try again.")).toBeNull();
  });

  it("shows the offline banner inside the Modal while offline", async () => {
    mockNetState = { isConnected: false };
    const screen = render(<Harness challenge={RIVAL} />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(within(modalOf(screen)).getByText("You're offline. Some features may not work.")).toBeTruthy();
  });

  it("shows no offline banner while online", async () => {
    const screen = render(<Harness challenge={RIVAL} />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByText("You're offline. Some features may not work.")).toBeNull();
  });

  it("mounts no feedback hosts while there is no challenge", () => {
    const screen = render(<Harness challenge={null} />);
    const modal = modalOf(screen);
    const { UNSAFE_queryByType } = render(<>{modal.props.children}</>);
    expect(UNSAFE_queryByType(ModalToaster)).toBeNull();
    expect(UNSAFE_queryByType(Toaster)).toBeNull();
  });
});

describe("ChallengePromptSheet keyboard", () => {
  it("dismisses a focused field's keyboard when a challenge appears, once per challenge", () => {
    const dismiss = jest.spyOn(Keyboard, "dismiss").mockImplementation(() => undefined);
    const screen = render(<Harness challenge={null} />);
    expect(dismiss).not.toHaveBeenCalled();
    screen.rerender(<Harness challenge={RIVAL} />);
    expect(dismiss).toHaveBeenCalledTimes(1);
    screen.rerender(<Harness challenge={{ ...RIVAL }} />);
    expect(dismiss).toHaveBeenCalledTimes(1);
    screen.rerender(<Harness challenge={{ ...RIVAL, challengeId: "ch-2" }} />);
    expect(dismiss).toHaveBeenCalledTimes(2);
    dismiss.mockRestore();
  });
});

describe("ChallengePromptSheet fade-out accessibility", () => {
  it("exposes the card while shown and hides the fading card from the accessibility tree", () => {
    const screen = render(<Harness challenge={RIVAL} />);
    const card = screen.getByTestId("challenge-prompt-card");
    expect(card.props.accessibilityElementsHidden).toBe(false);
    expect(card.props.importantForAccessibility).toBe("auto");

    screen.rerender(<Harness challenge={null} />);
    const { getByTestId, queryByText } = render(<>{modalOf(screen).props.children}</>);
    const fading = getByTestId("challenge-prompt-card", { includeHiddenElements: true });
    expect(fading.props.accessibilityElementsHidden).toBe(true);
    expect(fading.props.importantForAccessibility).toBe("no-hide-descendants");
    // So the title the match-loop harness looks for is gone from the tree.
    expect(queryByText("INCOMING CHALLENGE")).toBeNull();
    expect(queryByText("INCOMING CHALLENGE", { includeHiddenElements: true })).toBeTruthy();
  });
});
