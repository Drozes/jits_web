/**
 * Summary step: outcome colours (jits-9cgj) and the Rematch shortcut
 * (jits-00fr, summary half).
 *
 * - A draw's verdict and ELO loss are amber, never Signal Red; the delta keeps
 *   its ▼ prefix the harness reads.
 * - The after tile gets an outcome tone (never the old always-red accent).
 * - Rematch is a secondary outline button that dismisses the match screen to
 *   the Arena carrying `rematch=<opponent id>` (exitMatchTo, jits-tlk3);
 *   hidden for disputed matches.
 * - Back to Arena stays the single Signal Red cta; Share and Done stay.
 */
import * as React from "react";
import { render, fireEvent } from "@testing-library/react-native";

jest.mock("lucide-react-native", () => {
  const RN = require("react-native");
  const R = require("react");
  const stub = () => R.createElement(RN.View, { testID: "icon" });
  return new Proxy(
    {},
    { get: (_t: Record<string, unknown>, prop: string) => (prop === "__esModule" ? true : stub) },
  );
});

jest.mock("@/lib/theme/use-theme", () => ({
  useThemedTokens: () => ({ textPrimary: "#E8EDF2", textSecondary: "#9AA3AD" }),
  useResolvedColorScheme: () => "light",
}));

jest.mock("@/components/ui/toast", () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const mockDismissTo = jest.fn();
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ dismissTo: mockDismissTo, push: mockPush, back: jest.fn() }),
}));

jest.mock("@/lib/auth/hooks", () => ({ useAuth: () => ({ athlete: { id: "me-1" } }) }));

const mockEloTile = jest.fn();
jest.mock("@/components/ui/elo-system", () => {
  const R = require("react");
  const RN = require("react-native");
  return {
    EloTile: (props: Record<string, unknown>) => {
      mockEloTile(props);
      return R.createElement(RN.View, { testID: "elo-tile" });
    },
    Plate: ({ children }: { children: React.ReactNode }) => R.createElement(RN.View, null, children),
  };
});

import { SummaryStep, rematchHref } from "@/components/match-flow/steps/summary-step";
import { ARENA_EXIT_LABEL, ARENA_HREF } from "@/lib/arena/constants";

type Props = React.ComponentProps<typeof SummaryStep>;

function renderSummary(overrides: Partial<Props> = {}) {
  const props: Props = {
    matchId: "M1",
    exitHref: ARENA_HREF,
    exitLabel: ARENA_EXIT_LABEL,
    matchType: "ranked",
    matchStatus: "completed",
    outcome: "win",
    eloDelta: 16,
    eloBefore: 1000,
    eloAfter: 1016,
    weightDivisionGap: 0,
    videoId: null,
    videoPending: false,
    opponentId: "opp-1",
    opponentName: "Demo Red",
    ...overrides,
  };
  return render(<SummaryStep {...props} />);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("outcome colours", () => {
  it("a win: green verdict and delta, positive after tile", () => {
    const s = renderSummary();
    expect(s.getByTestId("summary-verdict").props.children).toBe("YOU WON");
    expect(s.getByTestId("summary-verdict").props.className).toContain("text-positive");
    const delta = s.getByTestId("summary-elo-delta");
    expect(delta.props.className).toContain("text-positive");
    expect(delta.props.children.join("")).toBe("▲ +16");
    expect(mockEloTile).toHaveBeenCalledWith(expect.objectContaining({ tone: "positive", before: 1000, after: 1016 }));
    expect(mockEloTile.mock.calls[0][0].accent).toBeUndefined();
  });

  it("a loss: red verdict and delta, negative after tile", () => {
    const s = renderSummary({ outcome: "loss", eloDelta: -16, eloAfter: 984 });
    expect(s.getByTestId("summary-verdict").props.className).toContain("text-negative");
    expect(s.getByTestId("summary-elo-delta").props.className).toContain("text-negative");
    expect(mockEloTile).toHaveBeenCalledWith(expect.objectContaining({ tone: "negative" }));
  });

  it("a draw: amber verdict and amber ELO loss, never Signal Red", () => {
    const s = renderSummary({ outcome: "draw", eloDelta: -8, eloAfter: 992 });
    const verdict = s.getByTestId("summary-verdict");
    expect(verdict.props.children).toBe("DRAW");
    expect(verdict.props.className).toContain("text-amber-600");
    const delta = s.getByTestId("summary-elo-delta");
    expect(delta.props.children.join("")).toBe("▼ 8");
    expect(delta.props.className).toContain("text-amber-600");
    expect(delta.props.className).not.toContain("text-negative");
    expect(mockEloTile).toHaveBeenCalledWith(expect.objectContaining({ tone: "amber" }));
  });

  it("a disputed match: plain note under the DISPUTED heading", () => {
    const s = renderSummary({ matchStatus: "disputed" });
    expect(s.getByTestId("summary-verdict").props.children).toBe("DISPUTED");
    const note = s.getByTestId("summary-disputed-note");
    expect(note.props.children).toBe("An admin will review it. Your rating change stands until they do.");
  });
});

describe("Rematch shortcut", () => {
  it("names the opponent and dismisses the match to the Arena carrying rematch=<id>", () => {
    const s = renderSummary();
    const btn = s.getByTestId("summary-rematch");
    expect(btn.props.accessibilityLabel).toBe("Rematch Demo Red");
    expect(s.getByText("Rematch Demo")).toBeTruthy();
    fireEvent.press(btn);
    expect(mockDismissTo).toHaveBeenCalledWith("/arena?rematch=opp-1");
    // A push would leave the match screen mounted, which keeps the athlete
    // offline and suppresses challenge prompts.
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("encodes the id and targets the Arena route", () => {
    expect(rematchHref("a b&c")).toBe(`${ARENA_HREF}?rematch=a%20b%26c`);
  });

  it("is a secondary outline, so Back to Arena stays the one Signal Red cta", () => {
    const s = renderSummary();
    expect(s.getByTestId("summary-rematch").props.className ?? "").not.toContain("bg-cta");
    type Node = { props: { className?: unknown; testID?: string } };
    const all = s.UNSAFE_root.findAll(
      (n: Node) =>
        typeof n.props.className === "string" &&
        /(^|\s)bg-cta(\s|$)/.test(n.props.className) &&
        !!n.props.testID,
    );
    expect(new Set(all.map((n: Node) => n.props.testID))).toEqual(new Set(["summary-exit"]));
    expect(s.getByText("Share Result")).toBeTruthy();
    expect(s.getByText("Done")).toBeTruthy();
  });

  it("demotes Done to a text link that still goes Home", () => {
    const s = renderSummary();
    const done = s.getByTestId("summary-done");
    expect(done.props.className).not.toContain("border");
    expect(done.props.className).not.toContain("bg-cta");
    expect(done.props.hitSlop).toEqual({ top: 8, bottom: 8, left: 8, right: 8 });
    expect(s.getByText("Done").props.className).toContain("text-ink-2");
    fireEvent.press(done);
    expect(mockDismissTo).toHaveBeenCalledWith("/");
  });

  it("works after a draw and a loss too", () => {
    expect(renderSummary({ outcome: "draw", eloDelta: -8 }).getByTestId("summary-rematch")).toBeTruthy();
    expect(renderSummary({ outcome: "loss", eloDelta: -16 }).getByTestId("summary-rematch")).toBeTruthy();
  });

  it("is hidden for a disputed match", () => {
    expect(renderSummary({ matchStatus: "disputed" }).queryByTestId("summary-rematch")).toBeNull();
  });

  it("is hidden without an opponent id or name", () => {
    expect(renderSummary({ opponentId: null }).queryByTestId("summary-rematch")).toBeNull();
    expect(renderSummary({ opponentName: "  " }).queryByTestId("summary-rematch")).toBeNull();
  });
});

describe("View match details link", () => {
  const cases: Array<[string, Partial<Props>]> = [
    ["with this device's video", { videoId: "vid-1" }],
    ["while the video is uploading", { videoPending: true }],
    ["with no video at all", {}],
    ["for a disputed match", { matchStatus: "disputed", videoId: "vid-1" }],
  ];

  it.each(cases)("is always offered %s, so both recordings are reachable", (_label, overrides) => {
    const s = renderSummary(overrides);
    const link = s.getByTestId("summary-view-match-details");
    // A text link, never a second red cta.
    expect(link.props.className).not.toContain("bg-cta");
    expect(link.props.className).not.toContain("border");
    fireEvent.press(link);
    expect(mockPush).toHaveBeenCalledWith("/(app)/match-detail/M1");
  });

  it("sits below the Watch button, which still plays this device's clip", () => {
    const s = renderSummary({ videoId: "vid-1" });
    fireEvent.press(s.getByText("Watch Match Video"));
    expect(mockPush).toHaveBeenCalledWith("/(app)/video/vid-1");
    const texts = s.UNSAFE_root.findAll(
      (n: { type: unknown; props: { children?: unknown } }) =>
        n.type === "Text" && typeof n.props.children === "string",
    ).map((n: { props: { children?: unknown } }) => n.props.children as string);
    expect(texts.indexOf("Watch Match Video")).toBeGreaterThanOrEqual(0);
    expect(texts.indexOf("Watch Match Video")).toBeLessThan(texts.indexOf("View match details"));
  });
});
