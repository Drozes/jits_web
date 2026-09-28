/**
 * Home's "Your new highlight" card (jr_be spec 014 sections 16.6.3 / 16.6.4):
 * exact copy, poster or placeholder, duration in mono, NO Signal Red CTA,
 * poster and Watch open the viewer with source=home and log home_card_tapped,
 * the dismiss icon calls onDismiss.
 */
import * as React from "react";
import { fireEvent, render } from "@testing-library/react-native";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ useRouter: () => ({ push: mockPush }) }));

jest.mock("lucide-react-native", () => {
  const RN = require("react-native");
  const R = require("react");
  const stub = () => R.createElement(RN.View, { testID: "icon" });
  return new Proxy({}, { get: (_t: unknown, p: string) => (p === "__esModule" ? true : stub) });
});

jest.mock("expo-image", () => {
  const R = require("react");
  const RN = require("react-native");
  return { Image: (props: Record<string, unknown>) => R.createElement(RN.View, { testID: "poster-image", ...props }) };
});

jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
jest.mock("@/lib/theme/use-theme", () => ({ useThemedTokens: () => ({ textTertiary: "#8D929D" }) }));

const mockLog = jest.fn();
jest.mock("@jits/shared/api/highlight-share", () => ({
  logHighlightShareEvent: (...a: unknown[]) => mockLog(...a),
}));

import { NewHighlightCard } from "@/components/dashboard/new-highlight-card";
import type { NewHighlight } from "@/lib/highlight/use-new-highlight";

function highlight(over: Partial<NewHighlight["item"]> = {}, posterUrl: string | null = "https://p.jpg"): NewHighlight {
  return {
    posterUrl,
    item: {
      highlightId: "h1",
      matchId: "m1",
      matchVideoId: "v1",
      version: 1,
      durationS: 31.4,
      posterPath: "k.jpg",
      readyAt: "2026-09-27T10:00:00Z",
      opponentName: "Demo Red",
      matchType: "ranked",
      outcome: "win",
      playedAt: "2026-09-27T09:00:00Z",
      notifiedAt: "2026-09-27T10:00:01Z",
      unseen: true,
      origin: null,
      ...over,
    },
  };
}

type HostNode = ReturnType<typeof render>["root"];
function redCtas(root: HostNode) {
  return root.findAll(
    (n: HostNode) =>
      typeof n.type === "string" &&
      typeof n.props.className === "string" &&
      /(^|\s)bg-cta(\s|$)/.test(n.props.className),
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockLog.mockResolvedValue(undefined);
});

describe("NewHighlightCard", () => {
  it("renders the exact copy with the duration in mono", () => {
    const u = render(<NewHighlightCard highlight={highlight()} onDismiss={jest.fn()} />);
    expect(u.getByText("NEW HIGHLIGHT")).toBeTruthy();
    expect(u.getByText("Your new highlight")).toBeTruthy();
    expect(u.getByTestId("new-highlight-line")).toHaveTextContent("vs Demo Red · 31s");
    const seconds = u.getByText("31s");
    expect(seconds.props.className).toContain("font-mono");
    expect(seconds.props.className).toContain("tabular-nums");
    expect(u.getByText("Watch")).toBeTruthy();
    expect(u.getByLabelText("Dismiss")).toBeTruthy();
  });

  it("shows the duration alone without an opponent", () => {
    const u = render(<NewHighlightCard highlight={highlight({ opponentName: null })} onDismiss={jest.fn()} />);
    expect(u.getByTestId("new-highlight-line")).toHaveTextContent(/^31s$/);
  });

  it("renders the signed poster, or a placeholder without one", () => {
    const withPoster = render(<NewHighlightCard highlight={highlight()} onDismiss={jest.fn()} />);
    expect(withPoster.getByTestId("poster-image").props.source).toEqual({ uri: "https://p.jpg" });
    withPoster.unmount();
    const without = render(<NewHighlightCard highlight={highlight({}, null)} onDismiss={jest.fn()} />);
    expect(without.queryByTestId("poster-image")).toBeNull();
  });

  it("carries no Signal Red CTA (Home's one red CTA is Resume or the Arena)", () => {
    const u = render(<NewHighlightCard highlight={highlight()} onDismiss={jest.fn()} />);
    expect(redCtas(u.root)).toHaveLength(0);
  });

  it.each(["new-highlight-watch", "new-highlight-poster"])(
    "%s opens the viewer with source=home and logs home_card_tapped",
    (testID) => {
      const u = render(<NewHighlightCard highlight={highlight()} onDismiss={jest.fn()} />);
      fireEvent.press(u.getByTestId(testID));
      expect(mockPush).toHaveBeenCalledWith("/highlight/h1?source=home");
      expect(mockLog).toHaveBeenCalledWith({}, "h1", "home_card_tapped", { source: "home" });
    },
  );

  it("dismiss calls onDismiss without navigating", () => {
    const onDismiss = jest.fn();
    const u = render(<NewHighlightCard highlight={highlight()} onDismiss={onDismiss} />);
    fireEvent.press(u.getByLabelText("Dismiss"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
  });
});
