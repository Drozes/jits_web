/**
 * The upload status card (verdict and match detail):
 *   - paused and failed render distinctly, each with its action (jits-n2im.3)
 *   - a terminal failure offers Discard, not Retry (jits-n2im.5)
 *   - a failed upload of a truncated clip says both facts (jits-5tj9.5)
 *   - "keep the app open" while uploading (jits-n2im.1)
 *   - the clip size on cellular (jits-n2im.6)
 *   - VoiceOver announcements on iOS (jits-5tj9.2)
 */
const mockNetwork = { type: "wifi" as string };
jest.mock("@/lib/network/use-network-status", () => ({
  useNetworkStatus: () => ({ isConnected: true, isInternetReachable: true, type: mockNetwork.type }),
}));

import { AccessibilityInfo, Platform } from "react-native";
import { fireEvent, render } from "@testing-library/react-native";
import { UploadProgressBanner } from "@/components/match-flow/upload-progress-banner";
import type { UploadBannerState } from "@/lib/video/upload-banner-state";

function state(patch: Partial<UploadBannerState>): UploadBannerState {
  return { kind: "hidden", message: null, truncation: null, progress: null, ...patch };
}

beforeEach(() => {
  mockNetwork.type = "wifi";
});

describe("paused vs failed", () => {
  it("renders paused in attention with Retry now, and calls back", () => {
    const onRetry = jest.fn();
    const s = render(
      <UploadProgressBanner {...state({ kind: "paused", message: "Upload paused: no connection.", progress: 0.4, errorClass: "offline" })} onRetry={onRetry} />,
    );
    expect(s.getByText("Upload paused")).toBeTruthy();
    expect(s.getByText("40%")).toBeTruthy();
    expect(s.getByTestId("upload-status-banner").props.className).toMatch(/border-attention/);
    fireEvent.press(s.getByText("Retry now"));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(s.queryByTestId("upload-discard")).toBeNull();
  });

  it("renders a retryable failure in negative with Retry upload", () => {
    const onRetry = jest.fn();
    const s = render(
      <UploadProgressBanner {...state({ kind: "error", message: "Upload failed: the server didn't accept this video.", errorClass: "not_allowed" })} onRetry={onRetry} />,
    );
    expect(s.getByTestId("upload-status-banner").props.className).toMatch(/border-negative/);
    fireEvent.press(s.getByText("Retry upload"));
    expect(onRetry).toHaveBeenCalled();
  });

  it("offers Discard, not Retry, for a failure a retry can never fix", () => {
    const onDiscard = jest.fn();
    const s = render(
      <UploadProgressBanner {...state({ kind: "error", message: "can't be uploaded", errorClass: "reslice_limit" })} onRetry={jest.fn()} onDiscard={onDiscard} />,
    );
    expect(s.queryByTestId("upload-retry")).toBeNull();
    fireEvent.press(s.getByText("Discard recording"));
    expect(onDiscard).toHaveBeenCalled();
  });

  it("offers nothing for a recorder failure (there is no upload to retry)", () => {
    const s = render(<UploadProgressBanner {...state({ kind: "error", message: "Camera not ready" })} onRetry={jest.fn()} />);
    expect(s.queryByTestId("upload-retry")).toBeNull();
    expect(s.queryByTestId("upload-discard")).toBeNull();
  });
});

describe("a truncated clip whose upload failed (jits-5tj9.5)", () => {
  it("says both that the upload failed and that the clip is short", () => {
    const s = render(
      <UploadProgressBanner {...state({ kind: "error", message: "Upload failed: the server didn't accept this video.", truncation: "limit", errorClass: "not_allowed" })} />,
    );
    expect(s.getByText(/server didn't accept this video/)).toBeTruthy();
    expect(s.getByText(/Recording hit its time limit\. The clip stops before the end of the match\./)).toBeTruthy();
  });

  it("and the same on a paused upload", () => {
    const s = render(<UploadProgressBanner {...state({ kind: "paused", message: "Upload paused.", truncation: "interrupted" })} />);
    expect(s.getByText(/Recording was interrupted/)).toBeTruthy();
  });
});

describe("while uploading", () => {
  it("tells the athlete to keep the app open", () => {
    const s = render(<UploadProgressBanner {...state({ kind: "uploading", progress: 0.42 })} />);
    expect(s.getByTestId("upload-keep-open")).toHaveTextContent("Keep ELO RATED open until your film uploads.");
    expect(s.getByText("42%")).toBeTruthy();
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

describe("VoiceOver announcements (jits-5tj9.2)", () => {
  const original = Platform.OS;
  let announce: jest.SpyInstance;

  beforeEach(() => {
    Object.defineProperty(Platform, "OS", { configurable: true, get: () => "ios" });
    announce = jest.spyOn(AccessibilityInfo, "announceForAccessibility").mockImplementation(() => undefined);
  });

  afterEach(() => {
    Object.defineProperty(Platform, "OS", { configurable: true, get: () => original });
    announce.mockRestore();
  });

  it("announces milestones and terminal states, not the state it mounted in", () => {
    const s = render(<UploadProgressBanner {...state({ kind: "uploading", progress: 0.1 })} />);
    expect(announce).not.toHaveBeenCalled();

    s.rerender(<UploadProgressBanner {...state({ kind: "uploading", progress: 0.3 })} />);
    expect(announce).toHaveBeenLastCalledWith("Upload 25 percent");
    s.rerender(<UploadProgressBanner {...state({ kind: "uploading", progress: 0.31 })} />);
    expect(announce).toHaveBeenCalledTimes(1);
    s.rerender(<UploadProgressBanner {...state({ kind: "uploading", progress: 0.8 })} />);
    expect(announce).toHaveBeenLastCalledWith("Upload 75 percent");

    s.rerender(<UploadProgressBanner {...state({ kind: "uploaded", progress: 1 })} />);
    expect(announce).toHaveBeenLastCalledWith("Match video uploaded");

    s.rerender(<UploadProgressBanner {...state({ kind: "error", message: "Upload failed: the server didn't accept this video.", errorClass: "not_allowed" })} />);
    expect(announce).toHaveBeenLastCalledWith("Upload failed: the server didn't accept this video.");
  });

  it("announces a pause with its reason", () => {
    const s = render(<UploadProgressBanner {...state({ kind: "uploading", progress: 0.1 })} />);
    s.rerender(<UploadProgressBanner {...state({ kind: "paused", message: "Upload paused: no connection." })} />);
    expect(announce).toHaveBeenLastCalledWith("Upload paused: no connection.");
  });

  it("leaves Android to its live region", () => {
    Object.defineProperty(Platform, "OS", { configurable: true, get: () => "android" });
    const s = render(<UploadProgressBanner {...state({ kind: "uploading", progress: 0.1 })} />);
    s.rerender(<UploadProgressBanner {...state({ kind: "uploaded", progress: 1 })} />);
    expect(announce).not.toHaveBeenCalled();
  });
});
