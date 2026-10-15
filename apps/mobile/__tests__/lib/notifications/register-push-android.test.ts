/**
 * Push registration on Android (jits-mafl.1, M2): the "default" channel is
 * exported for startup, Android emulators may register (FCM works on Google
 * Play images) while iOS simulators still may not, and a token fetch failure
 * reads `token_failed` instead of being mislabelled `no_project_id`.
 *
 * Source: apps/mobile/lib/notifications/register-push.ts
 */
import { Platform } from "react-native";

const mockGetToken = jest.fn();
const mockSetChannel = jest.fn(() => Promise.resolve(null));
jest.mock("expo-notifications", () => ({
  getPermissionsAsync: () => Promise.resolve({ status: "granted" }),
  requestPermissionsAsync: () => Promise.resolve({ status: "granted" }),
  getExpoPushTokenAsync: (...a: unknown[]) => mockGetToken(...a),
  setNotificationChannelAsync: (...a: unknown[]) => mockSetChannel(...(a as [])),
  AndroidImportance: { HIGH: 4 },
}));
const mockDevice = { isDevice: true };
jest.mock("expo-device", () => ({
  get isDevice() {
    return mockDevice.isDevice;
  },
  osName: "Android",
  modelName: "Pixel",
}));
let mockProjectId: string | undefined = "proj-1";
jest.mock("expo-constants", () => ({
  __esModule: true,
  default: {
    get expoConfig() {
      return { extra: { eas: { projectId: mockProjectId } } };
    },
  },
}));
const mockRegister = jest.fn();
jest.mock("@jits/shared/api/mutations", () => ({
  registerPushDevice: (...a: unknown[]) => mockRegister(...a),
  removePushDeviceByToken: jest.fn(),
}));

import {
  ANDROID_CHANNEL_ID,
  ensureAndroidChannel,
  registerForPushNotifications,
} from "@/lib/notifications/register-push";

const SB = {} as never;
const originalOS = Platform.OS;
function setOS(os: string) {
  Object.defineProperty(Platform, "OS", { configurable: true, get: () => os });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockDevice.isDevice = true;
  mockProjectId = "proj-1";
  mockRegister.mockResolvedValue({ ok: true, data: undefined });
});
afterEach(() => setOS(originalOS));

describe("ensureAndroidChannel", () => {
  it("creates the channel with id 'default' on Android (the backend sends channelId 'default')", async () => {
    setOS("android");
    expect(ANDROID_CHANNEL_ID).toBe("default");
    await ensureAndroidChannel();
    await ensureAndroidChannel();
    expect(mockSetChannel).toHaveBeenCalledTimes(2);
    expect(mockSetChannel).toHaveBeenCalledWith("default", expect.objectContaining({ importance: 4 }));
  });

  it("is a no-op on iOS", async () => {
    setOS("ios");
    await ensureAndroidChannel();
    expect(mockSetChannel).not.toHaveBeenCalled();
  });
});

describe("registerForPushNotifications", () => {
  it("an Android emulator registers", async () => {
    setOS("android");
    mockDevice.isDevice = false;
    mockGetToken.mockResolvedValue({ data: "ExponentPushToken[emu]" });
    const res = await registerForPushNotifications(SB, "a1");
    expect(res).toEqual({ ok: true, token: "ExponentPushToken[emu]" });
    expect(mockSetChannel).toHaveBeenCalledWith("default", expect.anything());
  });

  it("an iOS simulator is still not_a_device", async () => {
    setOS("ios");
    mockDevice.isDevice = false;
    const res = await registerForPushNotifications(SB, "a1");
    expect(res).toEqual({ ok: false, reason: "not_a_device" });
    expect(mockGetToken).not.toHaveBeenCalled();
  });

  it("a token fetch failure with a project id is token_failed", async () => {
    setOS("android");
    mockGetToken.mockRejectedValue(new Error("Default FirebaseApp is not initialized"));
    const res = await registerForPushNotifications(SB, "a1");
    expect(res).toEqual({ ok: false, reason: "token_failed", message: "Default FirebaseApp is not initialized" });
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it("no_project_id only when the project id is genuinely missing", async () => {
    setOS("ios");
    mockProjectId = undefined;
    mockGetToken.mockRejectedValue(new Error("No projectId"));
    const res = await registerForPushNotifications(SB, "a1");
    expect(res).toMatchObject({ ok: false, reason: "no_project_id" });
  });
});
