/**
 * Phase 2 review MAJOR 2 (specs/dynamic-capture-bitrate 16.3 E11): the
 * capture prep reads the iOS codec list before the camera screen (the
 * timekeeper's request sheet). The native helper can raise the camera
 * prompt while the permission is undetermined, so without a grant neither
 * path queries the codecs or asks for any permission.
 */
import { act, renderHook } from "@testing-library/react-native";
import { Platform } from "react-native";

const mockQuery = jest.fn(async () => ["hvc1", "avc1"]);
const mockPermission = jest.fn(async () => ({ granted: false, status: "undetermined", canAskAgain: true }));
const mockRequest = jest.fn();
jest.mock("expo-camera", () => ({
  CameraView: { getAvailableVideoCodecsAsync: () => mockQuery() },
  Camera: {
    getCameraPermissionsAsync: () => mockPermission(),
    requestCameraPermissionsAsync: () => mockRequest(),
    getMicrophonePermissionsAsync: () => mockPermission(),
    requestMicrophonePermissionsAsync: () => mockRequest(),
  },
}));
jest.mock("@jits/shared/api/location", () => ({ getFeatureFlag: async () => ({ ok: true, data: false }) }));
jest.mock("@/lib/supabase/client", () => ({ supabase: {} }));
jest.mock("@/lib/video/capture-location", () => ({ readCaptureLocation: async () => null }));
jest.mock("@/lib/video/net-probe", () => ({
  isNetProbeAbsent: () => false,
  runNetProbe: () => new Promise(() => undefined),
}));
jest.mock("@/lib/video/video-upload-manager", () => ({
  hasActiveVideoUploads: () => false,
  subscribeUploadActivity: () => () => undefined,
}));

import { __resetCapturePrepForTests, getCapturePrepSnapshot, startCapturePrep } from "@/lib/video/capture-prep";
import { __resetCaptureCodecsForTests } from "@/lib/video/capture-codecs";
import { useCaptureBitrate } from "@/lib/video/use-capture-bitrate";

async function flush() {
  await act(async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  });
}

let restoreOs: { restore: () => void };
beforeEach(() => {
  restoreOs = jest.replaceProperty(Platform, "OS", "ios");
  __resetCapturePrepForTests();
  __resetCaptureCodecsForTests();
  mockQuery.mockClear();
  mockRequest.mockClear();
  mockPermission.mockClear();
});
afterEach(() => {
  __resetCapturePrepForTests();
  restoreOs.restore();
});

it("the timekeeper sheet path: no codec query and no permission request without a grant", async () => {
  startCapturePrep("M1", { matchId: "M1" });
  await flush();
  expect(getCapturePrepSnapshot("M1")?.inputs).toEqual(expect.objectContaining({ codecs: null }));
  expect(mockPermission).toHaveBeenCalled();
  expect(mockQuery).not.toHaveBeenCalled();
  expect(mockRequest).not.toHaveBeenCalled();
});

it("the viewfinder hook path: no codec query and no permission request without a grant (iOS records as today)", async () => {
  const { result } = renderHook(() => useCaptureBitrate({ active: true, locked: false, quality: "720p", cameraUp: false, prepKey: "M2" }));
  await flush();
  expect(result.current.reason).toBe("ios_codec_unknown");
  expect(mockQuery).not.toHaveBeenCalled();
  expect(mockRequest).not.toHaveBeenCalled();
});

it("with the grant, the hook path queries the codecs", async () => {
  mockPermission.mockResolvedValueOnce({ granted: true, status: "granted", canAskAgain: true });
  const { result } = renderHook(() => useCaptureBitrate({ active: true, locked: false, quality: "720p", cameraUp: false, prepKey: "M3" }));
  await flush();
  expect(mockQuery).toHaveBeenCalledTimes(1);
  expect(result.current.codec).toBe("hvc1");
  expect(mockRequest).not.toHaveBeenCalled();
});
