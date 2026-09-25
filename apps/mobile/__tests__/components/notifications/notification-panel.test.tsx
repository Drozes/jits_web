/**
 * Regression: the notification bell looked dead. gorhom's BottomSheetModal gets
 * stuck in DISMISSING when dismiss() is called on a sheet that is not showing
 * (never presented, or already closed itself via backdrop / pan down), after
 * which every present() mounts and immediately tears down. The panel must only
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
    BottomSheetBackdrop: () => null,
    BottomSheetScrollView: (props: { children: React.ReactNode }) =>
      R.createElement(RN.View, {}, props.children),
  };
});

jest.mock("@/lib/theme/use-theme", () => ({
  useThemedTokens: () => ({ bgSecondary: "#13151B", textTertiary: "#8D929D" }),
}));

import { NotificationPanel } from "@/components/notifications/notification-panel";

function Harness({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return <NotificationPanel open={open} onOpenChange={onOpenChange} items={[]} />;
}

beforeEach(() => {
  mockPresent.mockClear();
  mockDismiss.mockClear();
  mockOnChange = undefined;
});

describe("NotificationPanel open/close", () => {
  it("does not dismiss a sheet that was never presented (initial closed render)", () => {
    render(<Harness open={false} onOpenChange={jest.fn()} />);
    expect(mockDismiss).not.toHaveBeenCalled();
    expect(mockPresent).not.toHaveBeenCalled();
  });

  it("presents on open and dismisses when the parent closes it", () => {
    const { rerender } = render(<Harness open={false} onOpenChange={jest.fn()} />);
    rerender(<Harness open onOpenChange={jest.fn()} />);
    expect(mockPresent).toHaveBeenCalledTimes(1);
    rerender(<Harness open={false} onOpenChange={jest.fn()} />);
    expect(mockDismiss).toHaveBeenCalledTimes(1);
  });

  it("does not dismiss again after the sheet closed itself, and can reopen", () => {
    const onOpenChange = jest.fn();
    const { rerender } = render(<Harness open={false} onOpenChange={onOpenChange} />);
    rerender(<Harness open onOpenChange={onOpenChange} />);
    expect(mockPresent).toHaveBeenCalledTimes(1);

    // Backdrop tap / pan down: gorhom closes the sheet and reports index -1.
    act(() => mockOnChange?.(-1));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    rerender(<Harness open={false} onOpenChange={onOpenChange} />);
    expect(mockDismiss).not.toHaveBeenCalled();

    rerender(<Harness open onOpenChange={onOpenChange} />);
    expect(mockPresent).toHaveBeenCalledTimes(2);
  });

  it("uses a fixed snap point instead of gorhom's default dynamic sizing", () => {
    render(<Harness open={false} onOpenChange={jest.fn()} />);
    expect(mockSheetProps.enableDynamicSizing).toBe(false);
  });
});
