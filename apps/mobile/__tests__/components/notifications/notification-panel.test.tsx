/**
 * Regression: the notification bell looked dead. gorhom's BottomSheetModal gets
 * stuck in DISMISSING when dismiss() is called on a sheet that is not showing
 * (never presented, or already closed itself via backdrop / pan down), after
 * which every present() mounts and immediately tears down. The panel must only
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
    BottomSheetBackdrop: () => null,
    BottomSheetScrollView: (props: { children: React.ReactNode }) =>
      R.createElement(RN.View, {}, props.children),
  };
});

jest.mock("@/lib/theme/use-theme", () => ({
  useThemedTokens: () => ({ bgSecondary: "#13151B", textTertiary: "#8D929D" }),
}));

jest.mock("lucide-react-native", () => {
  const RN = require("react-native");
  const R = require("react");
  const stub = () => R.createElement(RN.View, { testID: "icon" });
  return new Proxy({}, { get: (_t: unknown, p: string) => (p === "__esModule" ? true : stub) });
});

import { NotificationPanel } from "@/components/notifications/notification-panel";
import type { BellItem } from "@/lib/notifications/notification-items";

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

describe("NotificationPanel sections and rows (jits-dq85.8)", () => {
  const now = new Date().toISOString();
  const feed: BellItem[] = [
    { id: "challenge-recv-f", type: "challenge_received", title: "Challenge Received", body: "Alex sent you a challenge", challengeId: "f", createdAt: now, unread: true },
    { id: "session-s", type: "session_joined", title: "Joined", body: "Session row", createdAt: now },
  ];
  const missed: BellItem[] = [
    { id: "challenge-recv-o", type: "challenge_received", title: "Challenge Received", body: "Bo sent you a challenge", challengeId: "o", createdAt: "2026-01-01T00:00:00Z" },
  ];

  it("lists the Missed section after the feed", () => {
    const u = render(<NotificationPanel open onOpenChange={jest.fn()} items={feed} missed={missed} onItemPress={jest.fn()} />);
    expect(u.getByText("Missed")).toBeTruthy();
    // Section labels are headers, so the VoiceOver rotor can jump to Missed.
    expect(u.getByText("Missed").props.accessibilityRole).toBe("header");
    expect(u.getByRole("header", { name: "Missed" })).toBeTruthy();
    expect(u.getByTestId("notification-missed")).toHaveTextContent(/Bo sent you/);
    const texts = u.getAllByText(/sent you/).map((n) => n.props.children);
    expect(texts).toEqual(["Alex sent you a challenge", "Bo sent you a challenge"]);
  });

  it("has no Missed section with nothing missed, and the empty state only when both lists are empty", () => {
    const a = render(<NotificationPanel open onOpenChange={jest.fn()} items={feed} />);
    expect(a.queryByText("Missed")).toBeNull();
    a.unmount();
    const b = render(<NotificationPanel open onOpenChange={jest.fn()} items={[]} missed={missed} />);
    expect(b.queryByText("No notifications yet")).toBeNull();
    expect(b.getByText("Missed")).toBeTruthy();
  });

  it("a fresh challenge row (counted by the badge) shows the unread dot; a Missed row does not", () => {
    const u = render(<NotificationPanel open onOpenChange={jest.fn()} items={feed} missed={missed} onItemPress={jest.fn()} />);
    expect(u.getByTestId("notification-unread-challenge-recv-f")).toBeTruthy();
    expect(u.queryByTestId("notification-unread-challenge-recv-o")).toBeNull();
    expect(u.queryByTestId("notification-unread-session-s")).toBeNull();
    // VoiceOver hears which rows are new; the dot alone is visual only.
    expect(u.getByTestId("notification-row-challenge-recv-f").props.accessibilityValue?.text).toBe("new");
    expect(u.getByTestId("notification-row-challenge-recv-o").props.accessibilityValue?.text).toBeUndefined();
    expect(u.getByTestId("notification-row-session-s").props.accessibilityValue?.text).toBeUndefined();
  });

  it("rows with a route are tappable, Missed challenge rows included (AC-H15); others are not", () => {
    const onItemPress = jest.fn();
    const u = render(<NotificationPanel open onOpenChange={jest.fn()} items={feed} missed={missed} onItemPress={onItemPress} />);
    expect(u.getAllByRole("button")).toHaveLength(2); // the fresh and the Missed challenge rows
    fireEvent.press(u.getByText("Session row"));
    expect(onItemPress).not.toHaveBeenCalled();
    fireEvent.press(u.getByText("Bo sent you a challenge"));
    expect(onItemPress).toHaveBeenLastCalledWith(missed[0]);
    fireEvent.press(u.getByText("Alex sent you a challenge"));
    expect(onItemPress).toHaveBeenLastCalledWith(feed[0]);
    expect(onItemPress).toHaveBeenCalledTimes(2);
  });
});
