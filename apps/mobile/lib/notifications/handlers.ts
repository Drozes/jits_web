/**
 * Notification handler setup.
 *
 * - Foreground display: when a push arrives while the app is open we still want
 *   the OS banner (mirrors web's toast behaviour).
 * - Tap deep-linking: when the user taps a notification we read the optional
 *   `route` field from the payload data and call `router.push(route)`. A
 *   route into a family mobile no longer has (sessions, gyms, gym-manager;
 *   jits-gewv) goes Home instead of to an unmatched screen.
 *
 * Call `setupNotificationHandlers()` ONCE at app startup. The function is
 * idempotent so multiple invocations are harmless.
 */
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { HOME_HREF, isRetiredRoute } from "@/lib/deep-links/retired-routes";

let configured = false;
let responseSubscription: Notifications.EventSubscription | null = null;

interface NotificationData {
  route?: string;
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

  responseSubscription = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      const data = response.notification.request.content.data as
        | NotificationData
        | undefined;
      const route = data?.route;
      if (typeof route !== "string" || route.length === 0) return;
      const target = isRetiredRoute(route) ? HOME_HREF : route;
      try {
        // Cast: expo-router's typed routes don't know about runtime strings.
        router.push(target as never);
      } catch (err) {
        console.warn("[notifications] failed to deep-link", route, err);
      }
    },
  );
}

export function teardownNotificationHandlers(): void {
  if (responseSubscription) {
    responseSubscription.remove();
    responseSubscription = null;
  }
  configured = false;
}
