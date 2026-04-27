/**
 * Notification handler setup.
 *
 * - Foreground display: when a push arrives while the app is open we still want
 *   the OS banner (mirrors web's toast behaviour).
 * - Tap deep-linking: when the user taps a notification we read the optional
 *   `route` field from the payload data and call `router.push(route)`.
 *
 * Call `setupNotificationHandlers()` ONCE at app startup. The function is
 * idempotent so multiple invocations are harmless.
 */
import * as Notifications from "expo-notifications";
import { router } from "expo-router";

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
      try {
        // Cast: expo-router's typed routes don't know about runtime strings.
        router.push(route as never);
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
