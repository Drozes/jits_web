/**
 * The app-wide upload strip (jits-n2im.2, boards P-VS-01 / P-VS-02):
 * visible on the tabs and on pushed screens while a job is outstanding, a
 * tap opens /match-detail/<matchId>, Try again is its own 44 px button, and
 * it hides on the countdown / live and on the same match's verdict and
 * match detail. Never in a header (it mounts on the tab bar or under the
 * Stack).
 */
const mockPush = jest.fn();
let mockSegments: string[] = ["(app)", "(tabs)", "(home)"];
const mockRetry = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
  useSegments: () => mockSegments,
}));
jest.mock("react-native-safe-area-context", () => {
  const React = jest.requireActual("react");
  const SafeAreaInsetsContext = React.createContext({ top: 0, bottom: 34, left: 0, right: 0 });
  return { SafeAreaInsetsContext, useSafeAreaInsets: () => React.useContext(SafeAreaInsetsContext) };
});
jest.mock("@/lib/video/use-upload-actions", () => {
  const actual = jest.requireActual("@/lib/video/use-upload-actions");
  return { ...actual, useUploadActions: () => ({ retry: mockRetry, discard: jest.fn() }) };
});

import * as React from "react";
import { StyleSheet, Text } from "react-native";
import { act, fireEvent, render } from "@testing-library/react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StackStripFrame, TabsUploadStrip } from "@/components/video-status/upload-strip-slots";

/** The two placements as the layouts mount them; the stack one wraps a screen. */
function UploadStripSlot({ placement }: { placement: "tabs" | "stack" }) {
  return placement === "tabs" ? <TabsUploadStrip /> : <StackStripFrame>{null}</StackStripFrame>;
}

/** A pushed screen that reports the bottom inset it is given. */
function InsetProbe() {
  const insets = useSafeAreaInsets();
  return <Text testID="probe">{String(insets.bottom)}</Text>;
}
import { resetMatchUploadStore, setMatchUpload } from "@/lib/video/match-upload-store";
import { __resetStripSuppressionsForTests, useSuppressUploadStrip, type StripSuppression } from "@/lib/video/upload-strip-visibility";
import { STRIP_UPLOADED_MS } from "@/lib/video/upload-strip";

function Suppress({ rule }: { rule: StripSuppression | null }) {
  useSuppressUploadStrip(rule);
  return null;
}

beforeEach(() => {
  mockPush.mockReset();
  mockRetry.mockReset();
  mockSegments = ["(app)", "(tabs)", "(home)"];
  resetMatchUploadStore();
  __resetStripSuppressionsForTests();
});

describe("UploadStripSlot", () => {
  it("shows an upload on the tabs with its percent and opens that match", () => {
    act(() => {
      setMatchUpload("m1", { status: "uploading", progress: 0.42 });
    });
    const s = render(<UploadStripSlot placement="tabs" />);
    expect(s.getByText("UPLOADING MATCH VIDEO")).toBeTruthy();
    expect(s.getByText("42%")).toBeTruthy();
    const open = s.getByTestId("upload-strip-open");
    expect(open.props.accessibilityLabel).toBe("Uploading match video, 42 percent. Opens the match.");
    fireEvent.press(open);
    expect(mockPush).toHaveBeenCalledWith("/(app)/match-detail/m1");
  });

  it("hides when nothing is outstanding", () => {
    const s = render(<UploadStripSlot placement="tabs" />);
    expect(s.queryByTestId("upload-strip")).toBeNull();
  });

  it("paused: the cause and its own 44 px Try again", () => {
    act(() => {
      setMatchUpload("m1", { status: "paused", error: "No connection right now. It picks up where it left off.", errorClass: "offline" });
    });
    const s = render(<UploadStripSlot placement="tabs" />);
    expect(s.getByText("UPLOAD PAUSED")).toBeTruthy();
    expect(s.getByText("No connection right now. It picks up where it left off.")).toBeTruthy();
    const retry = s.getByTestId("upload-strip-retry");
    expect(StyleSheet.flatten(retry.props.style)).toMatchObject({ minHeight: 44 });
    fireEvent.press(retry);
    expect(mockRetry).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("is hidden on the countdown and live, for every job", () => {
    act(() => {
      setMatchUpload("m1", { status: "uploading", progress: 0.1 });
    });
    const s = render(
      <>
        <Suppress rule={{ kind: "all" }} />
        <UploadStripSlot placement="tabs" />
      </>,
    );
    expect(s.queryByTestId("upload-strip")).toBeNull();
  });

  it("is hidden on the same match's verdict and match detail, and comes back when they leave", () => {
    act(() => {
      setMatchUpload("m1", { status: "uploading", progress: 0.1 });
    });
    const s = render(
      <>
        <Suppress rule={{ kind: "match", matchId: "m1" }} />
        <UploadStripSlot placement="stack" />
      </>,
    );
    mockSegments = ["(app)", "match-detail", "[matchId]"];
    s.rerender(
      <>
        <Suppress rule={{ kind: "match", matchId: "m1" }} />
        <UploadStripSlot placement="stack" />
      </>,
    );
    expect(s.queryByTestId("upload-strip")).toBeNull();
    s.rerender(
      <>
        <Suppress rule={{ kind: "match", matchId: "other" }} />
        <UploadStripSlot placement="stack" />
      </>,
    );
    expect(s.getByTestId("upload-strip")).toBeTruthy();
  });

  it("on a pushed screen it sits above the safe area; on the tabs only the bar's copy shows", () => {
    act(() => {
      setMatchUpload("m1", { status: "uploading", progress: 0.1 });
    });
    mockSegments = ["(app)", "athlete", "[id]"];
    const pushed = render(<UploadStripSlot placement="stack" />);
    expect(StyleSheet.flatten(pushed.getByTestId("upload-strip").props.style)).toMatchObject({ paddingBottom: 34 });
    mockSegments = ["(app)", "(tabs)", "arena"];
    const tabs = render(<UploadStripSlot placement="stack" />);
    expect(tabs.queryByTestId("upload-strip")).toBeNull();
  });

  it("says 'Match video uploaded' for 4 s after the job lands, then hides", () => {
    jest.useFakeTimers();
    try {
      act(() => {
        setMatchUpload("m1", { status: "uploading", progress: 0.9 });
      });
      const s = render(<UploadStripSlot placement="tabs" />);
      act(() => {
        setMatchUpload("m1", { status: "uploaded", progress: 1 });
      });
      expect(s.getByText("MATCH VIDEO UPLOADED")).toBeTruthy();
      act(() => {
        jest.advanceTimersByTime(STRIP_UPLOADED_MS);
      });
      expect(s.queryByTestId("upload-strip")).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it("the screen under the strip gets a 0 bottom inset, so the safe area is padded once (no double gap)", () => {
    act(() => {
      setMatchUpload("m1", { status: "uploading", progress: 0.1 });
    });
    mockSegments = ["(app)", "match-detail", "[matchId]"];
    const s = render(
      <StackStripFrame>
        <InsetProbe />
      </StackStripFrame>,
    );
    expect(s.getByTestId("probe").props.children).toBe("0");
    expect(StyleSheet.flatten(s.getByTestId("upload-strip").props.style)).toMatchObject({ paddingBottom: 34 });
    act(() => {
      resetMatchUploadStore();
    });
    expect(s.getByTestId("probe").props.children).toBe("34");
  });

  it("hides on the full-screen players (they suppress every job)", () => {
    act(() => {
      setMatchUpload("m1", { status: "uploading", progress: 0.1 });
    });
    mockSegments = ["(app)", "video", "[id]"];
    const s = render(
      <>
        <Suppress rule={{ kind: "all" }} />
        <UploadStripSlot placement="stack" />
      </>,
    );
    expect(s.queryByTestId("upload-strip")).toBeNull();
  });

  it("both full-screen players register the all-jobs suppression", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("fs") as typeof import("fs");
    for (const f of ["app/(app)/video/[id].tsx", "app/(app)/highlight/[id].tsx"]) {
      expect(fs.readFileSync(require("path").join(__dirname, "../../..", f), "utf8")).toContain('useSuppressUploadStrip({ kind: "all" })');
    }
  });
});
