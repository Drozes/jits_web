/**
 * CameraOverlay permission states. Once iOS has recorded a denial it never
 * shows the prompt again, so the denied card has to offer the way back
 * (Settings); a "Grant Access" button there would do nothing.
 */
import * as React from "react";
import { Linking } from "react-native";
import { fireEvent, render } from "@testing-library/react-native";

jest.mock("expo-camera", () => ({ CameraView: () => null }));

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

import { CameraOverlay } from "@/components/match-flow/camera-overlay";

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

  it("offers Open Settings once the OS will not prompt again", () => {
    const openSettings = jest.spyOn(Linking, "openSettings").mockResolvedValue(undefined);
    try {
      const screen = renderOverlay(false);
      screen.getByText("Camera access denied");
      expect(screen.queryByText("Grant Access")).toBeNull();
      fireEvent.press(screen.getByText("Open Settings"));
      expect(openSettings).toHaveBeenCalledTimes(1);
      expect(screen.onRequestPermission).not.toHaveBeenCalled();
    } finally {
      openSettings.mockRestore();
    }
  });
});
