/**
 * Regression: the FIRST challenge after every launch was invisible.
 *
 * gorhom's BottomSheetModal gets stuck in DISMISSING when dismiss() is called
 * on a sheet that is not showing. The prompt's effect ran on mount with
 * challenge=null and called dismiss() on a never-presented modal, so the next
 * present() mounted the portal and rendered nothing. The prompt must only
 * dismiss a sheet it presented and that has not already closed itself.
 */
import * as React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";

const mockPresent = jest.fn();
const mockDismiss = jest.fn();
let mockOnChange: ((idx: number) => void) | undefined;
let mockSheetProps: Record<string, unknown> = {};

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
  useThemedTokens: () => ({ bgSecondary: "#13151B", textTertiary: "#8D929D" }),
}));

import { ChallengePromptSheet } from "@/components/arena/challenge-prompt-sheet";
import type { IncomingChallenge } from "@/lib/arena/use-arena-challenge";

const RIVAL: IncomingChallenge = {
  challengeId: "ch-1",
  challengerId: "a-9",
  challengerName: "Rival",
  challengerElo: 1350,
  challengerWeight: 190,
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
  mockPresent.mockClear();
  mockDismiss.mockClear();
  mockNotify.mockClear();
  mockOnChange = undefined;
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
