/**
 * The right rail under the ownership rule (spec 8.6, owner decision
 * 2026-10-06): a reel that is not yours never offers Share to Instagram, Share
 * reel, Save to Photos or Improve this reel. The bottom meta (owner decision
 * 2026-10-14): no Open match / View profile, only the subject's tappable
 * `@handle` when set.
 */
import * as React from "react";
import { fireEvent, render } from "@testing-library/react-native";

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
    savePermissionDenied: false,
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

  it("Photos permission refused: Settings (C-V9) joins the rail after Save and opens the system settings", () => {
    const { Linking } = require("react-native");
    const spy = jest.spyOn(Linking, "openSettings").mockResolvedValue(undefined);
    const utils = render(<ViewerActions {...props({ savePermissionDenied: true })} />);
    expect(utils.getByText("Settings", HIDDEN)).toBeTruthy();
    const settings = utils.getByLabelText("Open Settings");
    expect(settings.props.accessibilityHint).toBe("Allow ELO RATED to add to Photos in Settings to save your reel.");
    fireEvent.press(settings);
    expect(spy).toHaveBeenCalledTimes(1);
    const order = utils.getByTestId("viewer-rail").findAll((n: { props: { accessibilityLabel?: string; accessibilityRole?: string } }) => n.props.accessibilityRole === "button" && typeof n.props.accessibilityLabel === "string" && typeof (n as unknown as { type: unknown }).type === "string").map((n: { props: { accessibilityLabel?: string } }) => n.props.accessibilityLabel);
    expect(order).toEqual(["Share to Instagram", "Save to Photos", "Open Settings", "Improve this reel"]);
  });

  it("Share reel path: same short label, the share-sheet string for screen readers", () => {
    const utils = render(<ViewerActions {...props({ primaryPath: "share_sheet" })} />);
    expect(utils.getByLabelText("Share reel")).toBeTruthy();
    expect(utils.getByText("Share", HIDDEN)).toBeTruthy();
  });

  it.each([
    ["friend", reel(2, { isOwn: false, source: "friend" })],
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

describe("bottom meta: Instagram handle (owner decision 2026-10-14)", () => {
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
  let openURL: jest.SpyInstance;

  beforeEach(() => {
    const { Linking } = require("react-native");
    openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
  });
  afterEach(() => openURL.mockRestore());

  function expectNoSecondaryAction(utils: ReturnType<typeof render>) {
    expect(utils.queryByText("Open match")).toBeNull();
    expect(utils.queryByText("View profile")).toBeNull();
    expect(utils.queryByTestId("viewer-open-match")).toBeNull();
    expect(utils.queryByTestId("viewer-view-profile")).toBeNull();
  }

  it("own reel with a handle: @handle under the date line, a link that opens the Instagram profile", () => {
    const utils = render(<ViewerMeta progress={progress} meta={pageMeta(detail, reel(1), "marcus.reyes")} />);
    expect(utils.queryByTestId("viewer-title")).toBeNull();
    expect(utils.getByTestId("viewer-meta")).toHaveTextContent("OCT 04 · 0:28");
    const link = utils.getByTestId("viewer-instagram-handle");
    expect(link).toHaveTextContent("@marcus.reyes");
    expect(link.props.accessibilityRole).toBe("link");
    expect(link.props.accessibilityLabel).toBe("Instagram, @marcus.reyes");
    expect(link.props.accessibilityHint).toBe("Opens Instagram");
    fireEvent.press(link);
    expect(openURL).toHaveBeenCalledWith("https://www.instagram.com/marcus.reyes/");
    expectNoSecondaryAction(utils);
  });

  it("the single-reel viewer (no lane item) shows the viewer's handle too", () => {
    const utils = render(<ViewerMeta progress={progress} meta={pageMeta(detail, null, "bea")} />);
    expect(utils.getByTestId("viewer-instagram-handle")).toHaveTextContent("@bea");
  });

  it.each([null, undefined, "", "   "])("no handle (%p): no line, and no Open match / View profile", (handle) => {
    const utils = render(<ViewerMeta progress={progress} meta={pageMeta(detail, reel(1), handle)} />);
    expect(utils.queryByTestId("viewer-instagram-handle")).toBeNull();
    expect(utils.queryByText(/@/)).toBeNull();
    expectNoSecondaryAction(utils);
  });

  it("a failed open is swallowed", async () => {
    openURL.mockRejectedValueOnce(new Error("no handler"));
    const utils = render(<ViewerMeta progress={progress} meta={pageMeta(detail, reel(1), "marcus")} />);
    expect(() => fireEvent.press(utils.getByTestId("viewer-instagram-handle"))).not.toThrow();
    await Promise.resolve();
    expect(openURL).toHaveBeenCalledTimes(1);
  });

  it("a reel that is not yours shows its subject's handle, never the viewer's", () => {
    const other = reel(1, { isOwn: false, source: "friend", subjectInstagramHandle: "cruiz" });
    const utils = render(<ViewerMeta progress={progress} meta={pageMeta(detail, other, "me.handle")} />);
    expect(utils.getByTestId("viewer-instagram-handle")).toHaveTextContent("@cruiz");
    expect(utils.queryByText("@me.handle")).toBeNull();
    expectNoSecondaryAction(utils);
    utils.unmount();
    const unknown = render(<ViewerMeta progress={progress} meta={pageMeta(detail, reel(2, { isOwn: false, source: "friend" }), "me.handle")} />);
    expect(unknown.queryByTestId("viewer-instagram-handle")).toBeNull();
  });
});
