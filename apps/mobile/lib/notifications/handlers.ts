/**
 * Notification handler setup.
 *
 * - Foreground display: when a push arrives while the app is open we still want
 *   the OS banner (mirrors web's toast behaviour).
 * - Tap deep-linking: when the user taps a notification we read the optional
 *   `route` field from the payload data and call `router.push(route)`. A
 *   route into a family mobile no longer has (sessions, gyms, gym-manager;
 *   jits-gewv) goes Home instead of to an unmatched screen. A
 *   `highlight_ready` push (jr_be spec 014 section 16.4) without a usable
 *   `route` is sent to its viewer, `/highlight/<id>?source=push`.
 * - Cold start (spec 16.6.4): a tap that LAUNCHED the app is read once with
 *   `getLastNotificationResponseAsync()` when `markNotificationRouterReady()`
 *   is called (by Home, the first signed-in screen a launch lands on, so the
 *   router is mounted and the auth redirect in `app/index.tsx` has already
 *   run and cannot replace the pushed screen). A tap that arrives before that
 *   point through the listener is held, not pushed, for the same reason.
 *   Every response is routed at most once, keyed by its notification
 *   identifier, so a tap seen by both the listener and the cold-start read
 *   never navigates twice.
 *
 * Call `setupNotificationHandlers()` ONCE at app startup. The function is
 * idempotent so multiple invocations are harmless.
 */
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { HOME_HREF, isRetiredRoute } from "@/lib/deep-links/retired-routes";

let configured = false;
let responseSubscription: Notifications.EventSubscription | null = null;

/** True once a signed-in screen has mounted; see `markNotificationRouterReady`. */
let routerReady = false;
/** The cold-start read runs once per JS process. */
let coldStartChecked = false;
/** A tap received before the router was ready; routed when it becomes ready. */
let pendingResponse: Notifications.NotificationResponse | null = null;
/** Identifiers already routed (or deliberately dropped), never routed again. */
const handledIds = new Set<string>();

interface NotificationData {
  route?: unknown;
  type?: unknown;
  id?: unknown;
}

/** The push `data.type` of a ready highlight reel (jr_be push function, B10). */
export const HIGHLIGHT_READY_PUSH_TYPE = "highlight_ready";

/** Where a tapped notification leads, or null when it carries nowhere to go. */
export function notificationTarget(data: unknown): string | null {
  const d = (data ?? {}) as NotificationData;
  let route: string | null =
    typeof d.route === "string" && d.route.trim().length > 0 ? d.route : null;
  if (!route && d.type === HIGHLIGHT_READY_PUSH_TYPE && typeof d.id === "string" && d.id) {
    route = `/highlight/${encodeURIComponent(d.id)}?source=push`;
  }
  if (!route) return null;
  return isRetiredRoute(route) ? HOME_HREF : route;
}

function responseId(response: Notifications.NotificationResponse): string | null {
  const id = response?.notification?.request?.identifier;
  return typeof id === "string" && id.length > 0 ? id : null;
}

function navigate(response: Notifications.NotificationResponse): void {
  const data = response?.notification?.request?.content?.data;
  const target = notificationTarget(data);
  if (!target) return;
  try {
    // Cast: expo-router's typed routes don't know about runtime strings.
    router.push(target as never);
  } catch (err) {
    console.warn("[notifications] failed to deep-link", target, err);
  }
}

/**
 * Route a tap at most once. Before the router is ready the (latest) tap is
 * held; the identifier is only claimed when it is actually routed.
 */
function handleResponse(response: Notifications.NotificationResponse | null): void {
  if (!response) return;
  const id = responseId(response);
  if (id && handledIds.has(id)) return;
  if (!routerReady) {
    pendingResponse = response;
    return;
  }
  if (id) handledIds.add(id);
  navigate(response);
}

export function setupNotificationHandlers(): void {
  if (configured) return;
  configured = true;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: false,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });

  responseSubscription = Notifications.addNotificationResponseReceivedListener(handleResponse);
}

/**
 * Called by the first signed-in screen (Home) once it has mounted. Routes a
 * tap held from before this point, then (once per process) the tap that
 * launched the app. Idempotent.
 */
export function markNotificationRouterReady(): void {
  if (routerReady && coldStartChecked) return;
  routerReady = true;
  const held = pendingResponse;
  pendingResponse = null;
  handleResponse(held);
  if (coldStartChecked) return;
  coldStartChecked = true;
  void (async () => {
    try {
      const last = await Notifications.getLastNotificationResponseAsync();
      handleResponse(last);
      // A JS reload in the same native process would otherwise read it again.
      if (last) await Notifications.clearLastNotificationResponseAsync?.();
    } catch (err) {
      console.warn("[notifications] cold-start read failed", err);
    }
  })();
}

export function teardownNotificationHandlers(): void {
  if (responseSubscription) {
    responseSubscription.remove();
    responseSubscription = null;
  }
  configured = false;
}

/** Test-only: forget readiness, the held tap and every routed identifier. */
export function resetNotificationRoutingForTests(): void {
  routerReady = false;
  coldStartChecked = false;
  pendingResponse = null;
  handledIds.clear();
}
