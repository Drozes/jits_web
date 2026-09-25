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
import { act, render } from "@testing-library/react-native";

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
