/**
 * The upload status card (verdict and match detail), against the copy deck
 * (design/native-screens/proposals/2026-10-04-video-status/COPY-DECK.md):
 *   - paused and failed render distinctly (jits-n2im.3), with "Try again"
 *     (deck convention 4) at 44 px (convention 10)
 *   - red only when Try again can work; grey for what nobody can fix,
 *     with a quiet Discard when the clip is on the phone (deck 0.6)
 *   - a failed upload of a truncated clip says both facts (jits-5tj9.5)
 *   - "keep the app open" while uploading (jits-n2im.1)
 *   - the clip size on cellular (jits-n2im.6)
 *   - announcements on state change only, from the focused screen, on
 *     both platforms, with no live region (jits-5tj9.2, deck 10.1)
 */
const mockNetwork = { type: "wifi" as string };
jest.mock("@/lib/network/use-network-status", () => ({
  useNetworkStatus: () => ({ isConnected: true, isInternetReachable: true, type: mockNetwork.type }),
}));

import * as React from "react";
import { AccessibilityInfo, Platform } from "react-native";
import { act, fireEvent, render } from "@testing-library/react-native";
import { NavigationContext } from "@react-navigation/native";
import { UploadProgressBanner } from "@/components/match-flow/upload-progress-banner";
import type { UploadBannerState } from "@/lib/video/upload-banner-state";

function state(patch: Partial<UploadBannerState>): UploadBannerState {
  return { kind: "hidden", message: null, truncation: null, progress: null, ...patch };
}

beforeEach(() => {
  mockNetwork.type = "wifi";
});

describe("paused vs failed", () => {
  it("renders paused in attention with Try again (44 px), and calls back", () => {
    const onRetry = jest.fn();
    const s = render(
      <UploadProgressBanner {...state({ kind: "paused", message: "No connection right now. It picks up where it left off.", progress: 0.4, errorClass: "offline" })} onRetry={onRetry} />,
    );
    expect(s.getByText("Upload paused")).toBeTruthy();
    expect(s.getByText("No connection right now. It picks up where it left off.")).toBeTruthy();
    expect(s.getByText("40%")).toBeTruthy();
    expect(s.getByTestId("upload-status-banner").props.className).toMatch(/border-attention/);
    const retry = s.getByTestId("upload-retry");
    expect(retry.props.accessibilityLabel).toBe("Try again: upload match video");
    fireEvent.press(s.getByText("Try again"));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(s.queryByTestId("upload-discard")).toBeNull();
  });

  it("renders a retryable failure as act (red) with the deck's tag, helper and Try again", () => {
    const onRetry = jest.fn();
    const s = render(
      <UploadProgressBanner {...state({ kind: "error", message: "The upload didn't finish.", errorClass: "not_allowed" })} onRetry={onRetry} />,
    );
    expect(s.getByTestId("upload-status-banner").props.className).toMatch(/border-negative/);
    expect(s.getByText("Didn't upload")).toBeTruthy();
    expect(s.getByText("The upload didn't finish.")).toBeTruthy();
    fireEvent.press(s.getByText("Try again"));
    expect(onRetry).toHaveBeenCalled();
  });

  it("is grey, never red, for a failure nobody can fix; Discard is a quiet secondary", () => {
    const onDiscard = jest.fn();
    const s = render(
      <UploadProgressBanner {...state({ kind: "error", message: "This match can't take a video anymore.", errorClass: "reslice_limit" })} onRetry={jest.fn()} onDiscard={onDiscard} />,
    );
    const banner = s.getByTestId("upload-status-banner");
    expect(banner.props.className).not.toMatch(/negative/);
    expect(s.queryByTestId("upload-retry")).toBeNull();
    fireEvent.press(s.getByText("Discard recording"));
    expect(onDiscard).toHaveBeenCalled();
  });

  it("offers nothing, and stays grey, when the clip is already gone", () => {
    const s = render(
      <UploadProgressBanner {...state({ kind: "error", message: "The clip isn't on this phone anymore.", errorClass: "file_missing" })} onRetry={jest.fn()} onDiscard={jest.fn()} />,
    );
    expect(s.getByTestId("upload-status-banner").props.className).not.toMatch(/negative/);
    expect(s.queryByTestId("upload-retry")).toBeNull();
    expect(s.queryByTestId("upload-discard")).toBeNull();
  });

  it("offers nothing for a recorder failure (there is no upload to retry)", () => {
    const s = render(<UploadProgressBanner {...state({ kind: "error", message: "Camera not ready" })} onRetry={jest.fn()} />);
    expect(s.getByText("Camera not ready")).toBeTruthy();
    expect(s.queryByTestId("upload-retry")).toBeNull();
    expect(s.queryByTestId("upload-discard")).toBeNull();
  });

  it("carries no live region (deck 10.1)", () => {
    for (const kind of ["uploading", "paused", "error", "uploaded"] as const) {
      const s = render(<UploadProgressBanner {...state({ kind, message: "x", errorClass: kind === "error" ? "not_allowed" : null })} />);
      expect(s.getByTestId("upload-status-banner").props.accessibilityLiveRegion).toBeUndefined();
      s.unmount();
    }
  });
});

describe("a truncated clip whose upload failed (jits-5tj9.5)", () => {
  it("says both that the upload failed and that the clip is short", () => {
    const s = render(
      <UploadProgressBanner {...state({ kind: "error", message: "The upload didn't finish.", truncation: "limit", errorClass: "not_allowed" })} />,
    );
    expect(s.getByText(/The upload didn't finish\./)).toBeTruthy();
    expect(s.getByText(/Recording hit its time limit\. The clip stops before the end of the match\./)).toBeTruthy();
  });

  it("and the same on a paused upload", () => {
    const s = render(<UploadProgressBanner {...state({ kind: "paused", message: "Trying again shortly.", truncation: "interrupted" })} />);
    expect(s.getByText(/Recording was interrupted/)).toBeTruthy();
  });
});

describe("while uploading", () => {
  it("tells the athlete to keep the app open, and is a progressbar", () => {
    const s = render(<UploadProgressBanner {...state({ kind: "uploading", progress: 0.42 })} />);
    expect(s.getByText("Uploading match video")).toBeTruthy();
    expect(s.getByTestId("upload-keep-open")).toHaveTextContent("Keep ELO RATED open until your film uploads.");
    const banner = s.getByTestId("upload-status-banner");
    expect(banner.props.accessibilityRole).toBe("progressbar");
    expect(banner.props.accessibilityValue).toEqual({ min: 0, max: 100, now: 42 });
  });

  it("says Finishing recording while the recorder stops", () => {
    const s = render(<UploadProgressBanner {...state({ kind: "stopping" })} />);
    expect(s.getByText("Finishing recording")).toBeTruthy();
  });

  it("shows the clip size on cellular (mocked NetInfo)", () => {
    mockNetwork.type = "cellular";
    const s = render(<UploadProgressBanner {...state({ kind: "uploading", progress: 0.1, bytesTotal: 600 * 1024 * 1024 })} />);
    expect(s.getByTestId("upload-cellular-size")).toHaveTextContent("On cellular · 600 MB");
  });

  it("does not on wifi", () => {
    const s = render(<UploadProgressBanner {...state({ kind: "uploading", progress: 0.1, bytesTotal: 600 * 1024 * 1024 })} />);
    expect(s.queryByTestId("upload-cellular-size")).toBeNull();
  });
});

describe("screen-reader announcements (jits-5tj9.2, deck 10.1)", () => {
  const original = Platform.OS;
  let announce: jest.SpyInstance;

  beforeEach(() => {
    announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockImplementation(() => undefined);
  });

  afterEach(() => {
    Object.defineProperty(Platform, "OS", { configurable: true, get: () => original });
    announce.mockRestore();
  });

  it("announces state changes only, never percent ticks, and not the state it mounted in", () => {
    const s = render(<UploadProgressBanner {...state({ kind: "uploading", progress: 0.1 })} />);
    s.rerender(<UploadProgressBanner {...state({ kind: "uploading", progress: 0.3 })} />);
    s.rerender(<UploadProgressBanner {...state({ kind: "uploading", progress: 0.8 })} />);
    expect(announce).not.toHaveBeenCalled();

    s.rerender(<UploadProgressBanner {...state({ kind: "paused", message: "No connection right now. It picks up where it left off.", errorClass: "offline" })} />);
    expect(announce).toHaveBeenLastCalledWith("Upload paused. No connection right now. It picks up where it left off.");

    s.rerender(<UploadProgressBanner {...state({ kind: "uploaded", progress: 1 })} />);
    expect(announce).toHaveBeenLastCalledWith("Match video uploaded");
    expect(announce).toHaveBeenCalledTimes(2);
  });

  it("announces a Try again that failed again (a helper change in the same state)", () => {
    const s = render(<UploadProgressBanner {...state({ kind: "error", message: "The upload didn't finish.", errorClass: "not_allowed" })} />);
    s.rerender(<UploadProgressBanner {...state({ kind: "error", message: "Still can't upload. Check your connection.", errorClass: "not_allowed" })} />);
    expect(announce).toHaveBeenLastCalledWith("Didn't upload. Still can't upload. Check your connection.");
  });

  it("announces on Android too (no live region carries it any more)", () => {
    Object.defineProperty(Platform, "OS", { configurable: true, get: () => "android" });
    const s = render(<UploadProgressBanner {...state({ kind: "uploading", progress: 0.1 })} />);
    s.rerender(<UploadProgressBanner {...state({ kind: "uploaded", progress: 1 })} />);
    expect(announce).toHaveBeenCalledWith("Match video uploaded");
  });

  it("stays quiet on a screen that is not focused (the verdict under match detail)", () => {
    const listeners: Record<string, () => void> = {};
    let focused = false;
    const navigation = {
      isFocused: () => focused,
      addListener: (name: string, fn: () => void) => {
        listeners[name] = fn;
        return () => undefined;
      },
    };
    const wrap = (ui: React.ReactElement) => (
      <NavigationContext.Provider value={navigation as never}>{ui}</NavigationContext.Provider>
    );
    const s = render(wrap(<UploadProgressBanner {...state({ kind: "uploading", progress: 0.1 })} />));
    s.rerender(wrap(<UploadProgressBanner {...state({ kind: "uploaded", progress: 1 })} />));
    expect(announce).not.toHaveBeenCalled();

    // Coming back into focus does not replay what was missed.
    focused = true;
    act(() => listeners.focus?.());
    expect(announce).not.toHaveBeenCalled();
    s.rerender(wrap(<UploadProgressBanner {...state({ kind: "error", message: "The upload didn't finish.", errorClass: "not_allowed" })} />));
    expect(announce).toHaveBeenCalledTimes(1);
  });
});
