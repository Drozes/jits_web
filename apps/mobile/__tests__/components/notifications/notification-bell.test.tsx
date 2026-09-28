/**
 * Bell with ready-reel items (jr_be spec 014 section 16.6.4): the badge is
 * pending challenges + unseen highlight items; only highlight rows are
 * tappable (the others' routes point at retired /session paths); a tap closes
 * the panel and opens the viewer with source=bell; unread highlight rows carry
 * a dot.
 */
import * as React from "react";
import { act, fireEvent, render } from "@testing-library/react-native";

// The bell loads its panel with React.lazy(import()), which jest cannot run
// without VM modules: hand it the real panel synchronously instead.
jest.mock("react", () => ({
  ...jest.requireActual("react"),
  lazy: () => require("@/components/notifications/notification-panel").NotificationPanel,
}));

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));

jest.mock("lucide-react-native", () => {
  const RN = require("react-native");
  const R = require("react");
  const stub = () => R.createElement(RN.View, { testID: "icon" });
  return new Proxy({}, { get: (_t: unknown, p: string) => (p === "__esModule" ? true : stub) });
});

const mockPresent = jest.fn();
const mockDismiss = jest.fn();
jest.mock("@gorhom/bottom-sheet", () => {
  const R = require("react");
  const RN = require("react-native");
  return {
    BottomSheetModal: R.forwardRef((props: { children: React.ReactNode }, ref: unknown) => {
      R.useImperativeHandle(ref, () => ({ present: mockPresent, dismiss: mockDismiss }));
      return R.createElement(RN.View, { testID: "sheet" }, props.children);
    }),
    BottomSheetBackdrop: () => null,
    BottomSheetScrollView: (p: { children: React.ReactNode }) => R.createElement(RN.View, {}, p.children),
  };
});

jest.mock("@/lib/theme/use-theme", () => ({
  useThemedTokens: () => ({ textPrimary: "#fff", textTertiary: "#888", bgSecondary: "#111", accentCta: "#E63946", statePositive: "#0f0" }),
}));
jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));

let mockPending = 0;
jest.mock("@jits/shared/hooks/use-pending-challenges", () => ({
  usePendingChallenges: () => ({ count: mockPending }),
}));

let mockItems: unknown[] = [];
let mockUnseen = 0;
const mockRefresh = jest.fn();
jest.mock("@/hooks/use-notification-history", () => ({
  useNotificationHistory: () => ({ items: mockItems, unseenHighlights: mockUnseen, refresh: mockRefresh }),
}));

import { NotificationBell } from "@/components/notifications/notification-bell";
import { resetHighlightStore } from "@/lib/highlight/highlight-store";

const HIGHLIGHT_ROW = {
  type: "highlight_ready",
  id: "highlight-h1-v1",
  title: "Your highlight is ready",
  body: "Your reel vs Demo Red is ready to watch.",
  route: "/highlight/h1?source=bell",
  createdAt: new Date().toISOString(),
  unread: true,
};
const SEEN_HIGHLIGHT_ROW = { ...HIGHLIGHT_ROW, id: "highlight-h2-v1", route: "/highlight/h2?source=bell", unread: false };
const CHALLENGE_ROW = {
  type: "challenge_received",
  id: "c1",
  title: "New challenge",
  body: "Demo Blue challenged you",
  route: "/session/s-1",
  createdAt: new Date().toISOString(),
};

async function renderBell() {
  const u = render(<NotificationBell athleteId="a1" />);
  // The panel is React.lazy: let it resolve.
  await act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
  return u;
}

beforeEach(() => {
  resetHighlightStore();
  mockPush.mockClear();
  mockPresent.mockClear();
  mockDismiss.mockClear();
  mockPending = 0;
  mockUnseen = 0;
  mockItems = [HIGHLIGHT_ROW, SEEN_HIGHLIGHT_ROW, CHALLENGE_ROW];
});

describe("NotificationBell badge", () => {
  it.each([
    [0, 0, null],
    [2, 0, "2"],
    [0, 1, "1"],
    [2, 3, "5"],
    [60, 50, "99+"],
  ])("pending %i + unseen highlights %i -> %p", async (pending, unseen, shown) => {
    mockPending = pending;
    mockUnseen = unseen;
    const u = await renderBell();
    if (shown === null) {
      expect(u.queryByText(/^\d+\+?$/)).toBeNull();
    } else {
      expect(u.getByText(shown)).toBeTruthy();
    }
  });
});

describe("NotificationBell highlight rows", () => {
  it("only highlight rows are tappable", async () => {
    const u = await renderBell();
    expect(u.getByText("New challenge")).toBeTruthy();
    const buttons = u
      .getAllByRole("button")
      .map((b) => b.props.accessibilityLabel ?? "")
      .filter((l) => l !== "Notifications");
    // Two highlight rows, the challenge row is not a button.
    expect(buttons).toHaveLength(2);
    fireEvent.press(u.getByText("Demo Blue challenged you"));
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("a tap closes the panel and opens the viewer with source=bell", async () => {
    const u = await renderBell();
    fireEvent.press(u.getByLabelText("Notifications"));
    expect(mockPresent).toHaveBeenCalledTimes(1);
    fireEvent.press(u.getAllByText("Your highlight is ready")[0]);
    expect(mockPush).toHaveBeenCalledWith("/highlight/h1?source=bell");
    expect(mockDismiss).toHaveBeenCalledTimes(1);
  });

  it("marks unread highlight rows with a dot, seen ones without", async () => {
    const u = await renderBell();
    expect(u.getByTestId("notification-unread-highlight-h1-v1")).toBeTruthy();
    expect(u.queryByTestId("notification-unread-highlight-h2-v1")).toBeNull();
    expect(u.queryByTestId("notification-unread-c1")).toBeNull();
  });
});
