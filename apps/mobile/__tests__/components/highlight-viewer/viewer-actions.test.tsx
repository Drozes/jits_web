/**
 * The right rail and the bottom meta's secondary action under the ownership
 * rule (spec 8.6, owner decision 2026-10-06): a reel that is not yours never
 * offers Share to Instagram, Share reel, Save to Photos or Improve this reel;
 * Open match only for a participant, else View profile (C-V5).
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
jest.mock("@/lib/theme/use-theme", () => ({ useThemedTokens: () => ({}) }));
jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));

import { ViewerActions, type ViewerActionsProps } from "@/components/highlight-viewer/viewer-actions";
import { ViewerMeta } from "@/components/highlight-viewer/viewer-meta";
import { canManageReel } from "@/lib/highlight/reel-types";
import { pageMeta } from "@/lib/highlight/reel-meta";
import { reel } from "../../support/reel-fixtures";

function props(over: Partial<ViewerActionsProps> = {}): ViewerActionsProps {
  return {
    canManage: true,
    shareEnabled: true,
    primaryPath: "reels",
    canSaveToPhotos: true,
    saving: false,
    improveDisabled: false,
    onShare: jest.fn(),
    onSave: jest.fn(),
    onImprove: jest.fn(),
    ...over,
  };
}

/** The short labels are hidden from screen readers (the plate carries the full string). */
const HIDDEN = { includeHiddenElements: true };

const LABELS = ["Share to Instagram", "Share reel", "Save to Photos", "Improve this reel"];

describe("rail ownership (spec 8.6)", () => {
  it("own reel: Share to Instagram (the one red CTA), Save to Photos, Improve this reel", () => {
    const utils = render(<ViewerActions {...props({ canManage: canManageReel(reel(1)) })} />);
    expect(utils.getByLabelText("Share to Instagram")).toBeTruthy();
    expect(utils.getByLabelText("Save to Photos")).toBeTruthy();
    expect(utils.getByLabelText("Improve this reel")).toBeTruthy();
    // Short visible labels (C-V6 to C-V8); the full strings stay for screen readers.
    expect(utils.getByText("Share", HIDDEN)).toBeTruthy();
    expect(utils.getByText("Save", HIDDEN)).toBeTruthy();
    expect(utils.getByText("Improve", HIDDEN)).toBeTruthy();
    expect(utils.getByTestId("viewer-share").props.className).toContain("bg-cta");
    expect(utils.getByTestId("viewer-save").props.className).not.toContain("bg-cta");
    fireEvent.press(utils.getByTestId("viewer-share"));
  });

  it("Share reel path: same short label, the share-sheet string for screen readers", () => {
    const utils = render(<ViewerActions {...props({ primaryPath: "share_sheet" })} />);
    expect(utils.getByLabelText("Share reel")).toBeTruthy();
    expect(utils.getByText("Share", HIDDEN)).toBeTruthy();
  });

  it.each([
    ["friend", reel(2, { isOwn: false, source: "friend", viewerIsParticipant: false, subjectAthleteId: "ath-9" })],
    ["own-source but isOwn false", reel(3, { isOwn: false })],
  ])("not yours (%s): no rail at all, whatever the share flags say", (_name, item) => {
    expect(canManageReel(item)).toBe(false);
    for (const primaryPath of ["reels", "share_sheet"] as const) {
      const utils = render(<ViewerActions {...props({ canManage: canManageReel(item), primaryPath })} />);
      for (const label of LABELS) expect(utils.queryByLabelText(label)).toBeNull();
      for (const short of ["Share", "Save", "Improve"]) expect(utils.queryByText(short, HIDDEN)).toBeNull();
      expect(utils.queryByTestId("viewer-rail")).toBeNull();
      utils.unmount();
    }
  });
});

describe("secondary action (spec 8.6)", () => {
  const detail = {
    highlightId: "h1",
    matchVideoId: "v1",
    matchId: "m1",
    version: 1,
    clipsEnabled: true,
    shareEnabled: true,
    caption: { athleteName: "A", opponentName: "Bea", matchType: "ranked", outcome: "win", eloAfter: 1, eloDelta: 1, technique: null, playedAt: "2026-10-04T15:00:00Z" },
  } as never;
  const progress = { phase: "ready", renderTotal: 1, playback: { durationS: 28, version: 1 } } as never;

  beforeEach(() => mockPush.mockClear());

  it("a participant gets Open match to match detail", () => {
    const utils = render(<ViewerMeta progress={progress} meta={pageMeta(detail, reel(1, { isOwn: false, viewerIsParticipant: true }))} />);
    fireEvent.press(utils.getByText("Open match"));
    expect(mockPush).toHaveBeenCalledWith("/(app)/match-detail/m1");
    expect(utils.queryByText("View profile")).toBeNull();
  });

  it("anyone else gets View profile (C-V5) to the subject's profile, with the subject's name", () => {
    const item = reel(1, { isOwn: false, source: "friend", viewerIsParticipant: false, subjectAthleteId: "ath-9", opponentName: "C. Ruiz" });
    const utils = render(<ViewerMeta progress={progress} meta={pageMeta(detail, item)} />);
    expect(utils.getByTestId("viewer-title")).toHaveTextContent("C. Ruiz");
    fireEvent.press(utils.getByText("View profile"));
    expect(mockPush).toHaveBeenCalledWith("/(app)/athlete/ath-9");
    expect(utils.queryByText("Open match")).toBeNull();
  });

  it("own reel: vs {opp} and the mono date + duration line", () => {
    const utils = render(<ViewerMeta progress={progress} meta={pageMeta(detail, reel(1))} />);
    expect(utils.getByTestId("viewer-title")).toHaveTextContent("vs Bea");
    expect(utils.getByTestId("viewer-meta")).toHaveTextContent("OCT 04 · 0:28");
  });
});
