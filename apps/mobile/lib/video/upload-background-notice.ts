import { AppState, type AppStateStatus } from "react-native";
import * as Notifications from "expo-notifications";
import { isBackgroundUploadSupported } from "./upload-capabilities";
import { hasActiveVideoUploads, subscribeUploadActivity } from "./video-upload-manager";

/** `data.type` of the notice. It carries no route: a tap just opens the app. */
export const UPLOAD_BACKGROUNDED_NOTICE_TYPE = "match_upload_backgrounded";

export const UPLOAD_BACKGROUNDED_TITLE = "Your match film isn't uploaded yet";
export const UPLOAD_BACKGROUNDED_BODY = "Open ELO RATED to finish uploading it.";

let unbind: (() => void) | null = null;
/** One notice per backgrounding, not per chunk or per activity change. */
let notifiedThisBackground = false;
/** The delivered notice, so a settle or a return can take it back. */
let noticeId: string | null = null;
/** A schedule still in flight when the upload settled. */
let withdrawn = false;

function withdraw(): void {
  withdrawn = true;
  const id = noticeId;
  noticeId = null;
  if (!id) return;
  void Notifications.dismissNotificationAsync(id).catch(() => undefined);
  void Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined);
}

/**
 * Take back every notice of ours still in Notification Center, including
 * one from a process iOS killed while backgrounded, whose id this process
 * never knew (m6). Run on bind (launch) and on every return to the app;
 * by then the upload resumes on its own, so the notice is moot.
 */
function sweepPresented(): void {
  const api = Notifications as unknown as {
    getPresentedNotificationsAsync?: () => Promise<Notifications.Notification[]>;
  };
  if (typeof api.getPresentedNotificationsAsync !== "function") return;
  void api
    .getPresentedNotificationsAsync()
    .then((presented) => {
      for (const n of presented ?? []) {
        const data = n?.request?.content?.data as { type?: unknown } | undefined;
        if (data?.type !== UPLOAD_BACKGROUNDED_NOTICE_TYPE) continue;
        void Notifications.dismissNotificationAsync(n.request.identifier).catch(() => undefined);
      }
    })
    .catch(() => undefined);
}

function post(): void {
  withdrawn = false;
  void Notifications.scheduleNotificationAsync({
    content: {
      title: UPLOAD_BACKGROUNDED_TITLE,
      body: UPLOAD_BACKGROUNDED_BODY,
      data: { type: UPLOAD_BACKGROUNDED_NOTICE_TYPE },
    },
    // Immediate. iOS gives a backgrounding app a few seconds of JS, which is
    // ample for this call, and the upload itself stops when they run out.
    trigger: null,
  })
    .then((id) => {
      // The upload settled (or the app came back) while this was in flight.
      if (withdrawn) {
        void Notifications.dismissNotificationAsync(id).catch(() => undefined);
        return;
      }
      noticeId = id;
    })
    .catch(() => undefined);
}

function onAppState(next: AppStateStatus): void {
  if (next === "background") {
    if (notifiedThisBackground || !hasActiveVideoUploads()) return;
    notifiedThisBackground = true;
    post();
    return;
  }
  if (next === "active") {
    notifiedThisBackground = false;
    // Back in the app: the upload resumes on its own, the notice is moot.
    withdraw();
    sweepPresented();
  }
  // "inactive" (notification shade, app switcher) is not leaving the app.
}

/**
 * Tell the athlete when they leave the app mid-upload (jits-n2im.1).
 *
 * The app has no background transfer mode yet, so iOS suspends the upload
 * moments after the app backgrounds. One local notification per
 * backgrounding, while an upload is actually running, asks them to come
 * back; it is withdrawn when every upload settles or the app returns.
 * Skipped entirely once the binary can upload in the background.
 *
 * Uses the `expo-notifications` already in the field binary (local
 * scheduling, no new native module). If the athlete never granted
 * notification permission, iOS simply does not show it; this never asks.
 */
export function bindUploadBackgroundNotice(): () => void {
  if (unbind) return unbind;
  if (isBackgroundUploadSupported()) {
    unbind = () => {
      unbind = null;
    };
    return unbind;
  }
  sweepPresented();
  const sub = AppState.addEventListener("change", onAppState) as { remove?: () => void } | undefined;
  const off = subscribeUploadActivity(() => {
    if (!hasActiveVideoUploads()) withdraw();
  });
  unbind = () => {
    sub?.remove?.();
    off();
    withdraw();
    notifiedThisBackground = false;
    unbind = null;
  };
  return unbind;
}

/** Test-only. */
export function __resetUploadBackgroundNotice(): void {
  unbind?.();
  unbind = null;
  notifiedThisBackground = false;
  noticeId = null;
  withdrawn = false;
}
