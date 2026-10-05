/**
 * jits-n2im.1: the screen stays awake while any upload runs (app-wide, not
 * tied to the wizard step), and leaving the app mid-upload posts exactly
 * one local notification, withdrawn when the upload settles.
 */
const mockActivate = jest.fn((_tag?: string) => Promise.resolve());
const mockDeactivate = jest.fn((_tag?: string) => Promise.resolve());
jest.mock("expo-keep-awake", () => ({
  activateKeepAwakeAsync: (tag: string) => mockActivate(tag),
  deactivateKeepAwake: (tag: string) => mockDeactivate(tag),
}));

const mockSchedule = jest.fn((_req: unknown) => Promise.resolve("notice-1"));
const mockDismiss = jest.fn((_id: string) => Promise.resolve());
const mockCancel = jest.fn((_id: string) => Promise.resolve());
jest.mock("expo-notifications", () => ({
  scheduleNotificationAsync: (req: unknown) => mockSchedule(req),
  dismissNotificationAsync: (id: string) => mockDismiss(id),
  cancelScheduledNotificationAsync: (id: string) => mockCancel(id),
}));

// The manager's activity, doubled: tests flip `active` and fire listeners.
const mockActivity = { active: false, listeners: new Set<() => void>() };
jest.mock("@/lib/video/video-upload-manager", () => ({
  hasActiveVideoUploads: () => mockActivity.active,
  subscribeUploadActivity: (fn: () => void) => {
    mockActivity.listeners.add(fn);
    return () => mockActivity.listeners.delete(fn);
  },
}));

import { AppState } from "react-native";
import { UPLOAD_KEEP_AWAKE_TAG, __resetUploadKeepAwake, bindUploadKeepAwake } from "@/lib/video/upload-keep-awake";
import {
  UPLOAD_BACKGROUNDED_BODY,
  UPLOAD_BACKGROUNDED_NOTICE_TYPE,
  UPLOAD_BACKGROUNDED_TITLE,
  __resetUploadBackgroundNotice,
  bindUploadBackgroundNotice,
} from "@/lib/video/upload-background-notice";

function setActive(active: boolean): void {
  mockActivity.active = active;
  for (const fn of [...mockActivity.listeners]) fn();
}

async function flush(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}

let appStateHandler: ((s: string) => void) | null = null;

beforeEach(() => {
  jest.clearAllMocks();
  mockActivity.active = false;
  mockActivity.listeners.clear();
  appStateHandler = null;
  jest.spyOn(AppState, "addEventListener").mockImplementation(((_type: string, fn: (s: string) => void) => {
    appStateHandler = fn;
    return { remove: jest.fn() };
  }) as never);
});

afterEach(() => {
  __resetUploadKeepAwake();
  __resetUploadBackgroundNotice();
  jest.restoreAllMocks();
});

describe("upload keep-awake", () => {
  it("holds its own tag while any upload runs and releases it when all settle", () => {
    bindUploadKeepAwake();
    expect(mockActivate).not.toHaveBeenCalled();

    setActive(true);
    expect(mockActivate).toHaveBeenCalledWith(UPLOAD_KEEP_AWAKE_TAG);
    expect(UPLOAD_KEEP_AWAKE_TAG).toBe("match-upload");

    // More activity while held does not stack a second lock.
    setActive(true);
    expect(mockActivate).toHaveBeenCalledTimes(1);

    setActive(false);
    expect(mockDeactivate).toHaveBeenCalledWith("match-upload");
  });

  it("is independent of the match wizard: it never touches the match-live tag", () => {
    bindUploadKeepAwake();
    setActive(true);
    setActive(false);
    for (const call of [...mockActivate.mock.calls, ...mockDeactivate.mock.calls]) {
      expect(call[0]).not.toBe("match-live");
    }
  });

  it("picks up an upload already running when it binds", () => {
    mockActivity.active = true;
    bindUploadKeepAwake();
    expect(mockActivate).toHaveBeenCalledTimes(1);
  });
});

describe("backgrounding notice", () => {
  it("posts exactly one notification when the app backgrounds mid-upload", async () => {
    bindUploadBackgroundNotice();
    mockActivity.active = true;

    appStateHandler?.("background");
    appStateHandler?.("background");
    await flush();

    expect(mockSchedule).toHaveBeenCalledTimes(1);
    expect(mockSchedule).toHaveBeenCalledWith({
      content: {
        title: UPLOAD_BACKGROUNDED_TITLE,
        body: UPLOAD_BACKGROUNDED_BODY,
        data: { type: UPLOAD_BACKGROUNDED_NOTICE_TYPE },
      },
      trigger: null,
    });
  });

  it("withdraws it when the upload settles", async () => {
    bindUploadBackgroundNotice();
    mockActivity.active = true;
    appStateHandler?.("background");
    await flush();

    setActive(false);
    await flush();
    expect(mockDismiss).toHaveBeenCalledWith("notice-1");
  });

  it("posts nothing when the app backgrounds with no upload running", async () => {
    bindUploadBackgroundNotice();
    appStateHandler?.("background");
    await flush();
    expect(mockSchedule).not.toHaveBeenCalled();
  });

  it("ignores 'inactive' (the notification shade is not leaving the app)", async () => {
    bindUploadBackgroundNotice();
    mockActivity.active = true;
    appStateHandler?.("inactive");
    await flush();
    expect(mockSchedule).not.toHaveBeenCalled();
  });

  it("posts again on the next backgrounding, once per backgrounding", async () => {
    bindUploadBackgroundNotice();
    mockActivity.active = true;
    appStateHandler?.("background");
    await flush();
    appStateHandler?.("active");
    await flush();
    expect(mockDismiss).toHaveBeenCalledWith("notice-1");
    appStateHandler?.("background");
    await flush();
    expect(mockSchedule).toHaveBeenCalledTimes(2);
  });

  it("takes back a notice whose schedule was still in flight when the upload settled", async () => {
    let resolveId: (id: string) => void = () => undefined;
    mockSchedule.mockImplementationOnce(() => new Promise<string>((res) => (resolveId = res)));
    bindUploadBackgroundNotice();
    mockActivity.active = true;
    appStateHandler?.("background");
    setActive(false);
    resolveId("late-1");
    await flush();
    expect(mockDismiss).toHaveBeenCalledWith("late-1");
  });
});
