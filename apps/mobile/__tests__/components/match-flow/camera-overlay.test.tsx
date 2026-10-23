/**
 * CameraOverlay permission states. Once iOS has recorded a denial it never
 * shows the prompt again, so a "Grant Access" button there would do nothing.
 * It must not offer "Open Settings" either: iOS terminates the app when a
 * camera or microphone privacy switch changes, and this card only renders
 * inside the match wizard, so that round trip kills the app mid-match.
 */
import * as React from "react";
import { Linking } from "react-native";
import { fireEvent, render } from "@testing-library/react-native";

/** The props the last CameraView rendered with (capture policy, A21, A22). */
const mockCameraProps: { current: Record<string, unknown> | null } = { current: null };
jest.mock("expo-camera", () => ({
  CameraView: (props: Record<string, unknown>) => {
    mockCameraProps.current = props;
    return null;
  },
}));

jest.mock("@/lib/theme/use-theme", () => ({
  useThemedTokens: () => ({ textPrimary: "#E8EDF2", textSecondary: "#9AA4AE" }),
}));

jest.mock("lucide-react-native", () => {
  const RN = require("react-native");
  const R = require("react");
  return new Proxy(
    {},
    {
      get: (_t: Record<string, unknown>, prop: string) =>
        prop === "__esModule"
          ? true
          : () => R.createElement(RN.View, { testID: `icon-${String(prop)}` }),
    },
  );
});

const mockWindow = { width: 390, height: 844 };
jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: () => ({ ...mockWindow, scale: 3, fontScale: 1 }),
}));

beforeEach(() => {
  mockWindow.width = 390;
  mockWindow.height = 844;
});

import { CameraOverlay, type Viewfinder } from "@/components/match-flow/camera-overlay";
import { onMediaTokens } from "@/lib/tokens";
import { readyPreviewBox, type ReadyPreviewShape } from "@/lib/video/recorded-frame";

/** What `MatchRecorderCamera` hands the overlay, built from the mocked window at render time. */
function viewfinder(shape: ReadyPreviewShape = "recorded", overrides: Partial<Viewfinder> = {}): Viewfinder {
  return {
    card: readyPreviewBox(mockWindow.width, mockWindow.height, shape),
    videoQuality: "720p",
    selectedLens: undefined,
    wideLens: false,
    ...overrides,
  };
}

function renderOverlay(canAskAgain: boolean) {
  const onRequestPermission = jest.fn();
  const utils = render(
    <CameraOverlay
      cameraRef={{ current: null }}
      permissionGranted={false}
      permissionCanAskAgain={canAskAgain}
      onRequestPermission={onRequestPermission}
      onCameraReady={jest.fn()}
      recording={false}
      viewfinder={viewfinder()}
    />,
  );
  return { ...utils, onRequestPermission };
}

describe("CameraOverlay without permission", () => {
  it("asks in-app while the OS will still prompt", () => {
    const screen = renderOverlay(true);
    screen.getByText("Camera access needed");
    fireEvent.press(screen.getByText("Grant Access"));
    expect(screen.onRequestPermission).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Open Settings")).toBeNull();
  });

  it("never sends the athlete to Settings mid-match once the OS will not prompt again", () => {
    const openSettings = jest.spyOn(Linking, "openSettings").mockResolvedValue(undefined);
    const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    try {
      const screen = renderOverlay(false);
      screen.getByText("Camera access denied");
      // The copy explains the match still runs and warns about the restart.
      screen.getByText(/will not be recorded and runs as normal/);
      screen.getByText(/Changing them restarts the app/);
      expect(screen.queryByText("Grant Access")).toBeNull();
      expect(screen.queryByText("Open Settings")).toBeNull();
      expect(screen.queryAllByRole("button")).toHaveLength(0);
      expect(openSettings).not.toHaveBeenCalled();
      expect(openURL).not.toHaveBeenCalled();
      expect(screen.onRequestPermission).not.toHaveBeenCalled();
    } finally {
      openSettings.mockRestore();
      openURL.mockRestore();
    }
  });
});

describe("CameraOverlay fullscreen (live step)", () => {
  function renderFull(granted: boolean, recording = true) {
    return render(
      <CameraOverlay
        cameraRef={{ current: null }}
        permissionGranted={granted}
        permissionCanAskAgain
        onRequestPermission={jest.fn()}
        onCameraReady={jest.fn()}
        recording={recording}
        layout="fullscreen"
        viewfinder={viewfinder()}
      />,
    );
  }

  it("draws the camera at the recorded 9:16 aspect, top-aligned, with no REC pill", () => {
    const screen = renderFull(true);
    const frame = screen.getByTestId("camera-frame");
    expect(frame.props.style).toEqual(
      expect.objectContaining({ position: "absolute", width: 390, left: 0, top: 0 }),
    );
    expect(frame.props.style.height).toBeCloseTo(693.33, 2);
    // The live HUD owns the tally.
    expect(screen.queryByText("REC")).toBeNull();
  });

  it("renders only the solid ground without permission (the live screen draws the plate)", () => {
    const screen = renderFull(false);
    screen.getByTestId("camera-no-feed-ground");
    expect(screen.queryByText("Camera access needed")).toBeNull();
    expect(screen.queryByText("Grant Access")).toBeNull();
  });

  it("keeps the REC pill in the card layout", () => {
    const screen = render(
      <CameraOverlay
        cameraRef={{ current: null }}
        permissionGranted
        permissionCanAskAgain
        onRequestPermission={jest.fn()}
        onCameraReady={jest.fn()}
        recording
        viewfinder={viewfinder()}
      />,
    );
    screen.getByText("REC");
  });
});

describe("CameraOverlay in landscape", () => {
  // The wide 16:9 card: the ready preview before A21, kept for a landscape
  // capture policy (spec 13.6).
  function renderGranted(layout: "card" | "fullscreen") {
    return render(
      <CameraOverlay
        cameraRef={{ current: null }}
        permissionGranted
        permissionCanAskAgain
        onRequestPermission={jest.fn()}
        onCameraReady={jest.fn()}
        recording={false}
        layout={layout}
        viewfinder={viewfinder("wide")}
      />,
    );
  }

  it("live: draws the camera at 16:9, full height, horizontally centered", () => {
    mockWindow.width = 844;
    mockWindow.height = 390;
    const frame = renderGranted("fullscreen").getByTestId("camera-frame").props.style;
    expect(frame).toEqual(expect.objectContaining({ position: "absolute", height: 390, top: 0 }));
    expect(frame.width).toBeCloseTo(693.33, 2);
    expect(frame.left).toBeCloseTo(75.33, 2);
  });

  it("ready: a centered 16:9 card at 0.6 x height x 16 / 9, capped at the content width", () => {
    mockWindow.width = 844;
    mockWindow.height = 390;
    const card = renderGranted("card").getByTestId("camera-card").props.style;
    // The media ground is the on-media black token (R3 MF-10, WP7), not `bg-black`.
    expect(card).toEqual({ width: 416, maxWidth: "100%", alignSelf: "center", backgroundColor: "#000000" });
  });

  it("ready in portrait: the card stays full width", () => {
    // Full width comes from the class; the style carries only the on-media black (WP7).
    expect(renderGranted("card").getByTestId("camera-card").props.style).toEqual({ backgroundColor: "#000000" });
  });

});

// The capture policy (timekeeper mode spec 13, A21 to A23): the ready preview
// is the recorded 9:16 frame, the camera takes the quality and lens it is
// given, and the timekeeper's preview carries TK-REC3 on the ultrawide.
describe("CameraOverlay capture policy", () => {
  function renderCapture(
    overrides: Partial<React.ComponentProps<typeof CameraOverlay>> = {},
    vf: Partial<Viewfinder> & { shape?: ReadyPreviewShape } = {},
  ) {
    const { shape, ...rest } = vf;
    return render(
      <CameraOverlay
        cameraRef={{ current: null }}
        permissionGranted
        permissionCanAskAgain
        onRequestPermission={jest.fn()}
        onCameraReady={jest.fn()}
        recording={false}
        viewfinder={viewfinder(shape, rest)}
        {...overrides}
      />,
    );
  }

  beforeEach(() => {
    mockCameraProps.current = null;
  });

  it("ready in portrait: the recorded 9:16 frame at the row's start (its lines sit beside it)", () => {
    const screen = renderCapture();
    const card = screen.getByTestId("camera-card").props.style;
    // 390 wide: the shipped 16:9 frame (356 x 200.25) plus 42 is 242.25
    // tall, so 136.27 wide inside the 1 pt border, 138.27 outside.
    expect(card).toEqual(
      expect.objectContaining({ maxWidth: "100%", alignSelf: "flex-start", backgroundColor: "#000000" }),
    );
    expect(card.width).toBeCloseTo(138.27, 2);
    expect(screen.getByTestId("camera-frame").props.style).toEqual({ aspectRatio: 9 / 16 });
  });

  it("ready in a landscape window (a lock the system ignores): the centered 16:9 card, since that is what records", () => {
    mockWindow.width = 844;
    mockWindow.height = 390;
    const screen = renderCapture();
    expect(screen.getByTestId("camera-card").props.style).toEqual(
      expect.objectContaining({ width: 416, alignSelf: "center" }),
    );
    expect(screen.getByTestId("camera-frame").props.style).toEqual({ aspectRatio: 16 / 9 });
  });

  it("the wide shape keeps the full-width 16:9 card in portrait", () => {
    const screen = renderCapture({}, { shape: "wide" });
    expect(screen.getByTestId("camera-card").props.style).toEqual({ backgroundColor: "#000000" });
    expect(screen.getByTestId("camera-frame").props.style).toEqual({ aspectRatio: 16 / 9 });
  });

  it("live ignores the ready card: the full-screen recorded frame", () => {
    const frame = renderCapture({ layout: "fullscreen" }).getByTestId("camera-frame").props.style;
    expect(frame).toEqual(expect.objectContaining({ position: "absolute", width: 390, top: 0 }));
  });

  it("the camera records at the quality it is given (the admin flag) on the lens it is given", () => {
    renderCapture();
    expect(mockCameraProps.current).toEqual(
      expect.objectContaining({ mode: "video", facing: "back", videoQuality: "720p", selectedLens: undefined }),
    );
    renderCapture({}, { videoQuality: "1080p", selectedLens: "Back Ultra Wide Camera" });
    expect(mockCameraProps.current).toEqual(
      expect.objectContaining({ videoQuality: "1080p", selectedLens: "Back Ultra Wide Camera" }),
    );
  });

  it("TK-REC3: WIDE LENS on the ready card while the ultrawide is selected, on the badge fill", () => {
    const screen = renderCapture({}, { wideLens: true });
    const tag = screen.getByTestId("camera-wide-lens-tag");
    expect(tag.props.accessibilityLabel).toBe("Recording with the wide lens");
    expect(tag.props.style).toEqual({ backgroundColor: onMediaTokens.badge });
    screen.getByText("WIDE LENS");
  });

  it("no WIDE LENS tag on the default lens, nor over the live screen (the live chrome owns it)", () => {
    expect(renderCapture().queryByTestId("camera-wide-lens-tag")).toBeNull();
    expect(
      renderCapture({ layout: "fullscreen" }, { wideLens: true }).queryByTestId("camera-wide-lens-tag"),
    ).toBeNull();
  });
});
