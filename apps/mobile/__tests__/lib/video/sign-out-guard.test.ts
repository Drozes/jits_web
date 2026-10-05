/**
 * jits-n2im.6: signing out with a pending match-film upload asks first,
 * naming who has to sign back in; with nothing pending it does not ask.
 */
import { Alert } from "react-native";
import { __setUploadControl } from "@/lib/video/upload-control";
import {
  SIGN_OUT_UPLOAD_TITLE,
  confirmSignOutWithPendingUploads,
  pendingUploadSignOutMessage,
  signOutUploadMessage,
} from "@/lib/video/sign-out-guard";

const control = {
  retry: jest.fn(async () => true),
  discard: jest.fn(async () => true),
  hasPending: jest.fn(async () => false),
  stopForSignOut: jest.fn(),
};

let alertSpy: jest.SpyInstance;

beforeEach(() => {
  jest.clearAllMocks();
  __setUploadControl(control);
  alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => undefined);
});

afterEach(() => {
  __setUploadControl(null);
  alertSpy.mockRestore();
});

it("names the athlete who has to sign back in", () => {
  expect(signOutUploadMessage("Ana Silva")).toBe(
    "Your match film hasn't finished uploading. Sign out anyway? It will finish the next time you sign in as Ana Silva.",
  );
  expect(signOutUploadMessage(null)).toBe(
    "Your match film hasn't finished uploading. Sign out anyway? It will finish the next time you sign in.",
  );
});

it("does not ask when nothing is pending", async () => {
  await expect(confirmSignOutWithPendingUploads("Ana")).resolves.toBe(true);
  expect(alertSpy).not.toHaveBeenCalled();
});

it("asks when an upload is pending, and goes ahead only on 'Sign out anyway'", async () => {
  control.hasPending.mockResolvedValue(true);
  const answer = confirmSignOutWithPendingUploads("Ana");
  await Promise.resolve();
  await Promise.resolve();
  expect(alertSpy).toHaveBeenCalledTimes(1);
  const [title, message, buttons] = alertSpy.mock.calls[0];
  expect(title).toBe(SIGN_OUT_UPLOAD_TITLE);
  expect(message).toMatch(/as Ana\.$/);
  buttons.find((b: { text: string }) => b.text === "Sign out anyway").onPress();
  await expect(answer).resolves.toBe(true);
});

it("stays signed in on Cancel", async () => {
  control.hasPending.mockResolvedValue(true);
  const answer = confirmSignOutWithPendingUploads("Ana");
  await Promise.resolve();
  await Promise.resolve();
  alertSpy.mock.calls[0][2].find((b: { text: string }) => b.text === "Cancel").onPress();
  await expect(answer).resolves.toBe(false);
});

it("is safe before the upload manager has loaded", async () => {
  __setUploadControl(null);
  await expect(pendingUploadSignOutMessage("Ana")).resolves.toBeNull();
});
