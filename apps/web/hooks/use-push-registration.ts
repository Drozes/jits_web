"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { registerPushDevice } from "@/lib/api/mutations";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

/** Convert a base64 URL-safe string to a Uint8Array (for applicationServerKey). */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

/**
 * Registers the service worker and subscribes to Web Push on app launch.
 * Fire-and-forget — silently no-ops if push isn't supported.
 */
export function usePushRegistration(athleteId: string): void {
  const registered = useRef(false);

  useEffect(() => {
    if (registered.current) return;
    if (!VAPID_PUBLIC_KEY) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

    registered.current = true;

    (async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js");

        // Wait for the service worker to be ready
        await navigator.serviceWorker.ready;

        // Check for existing subscription first
        let subscription = await registration.pushManager.getSubscription();

        if (!subscription) {
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY).buffer as ArrayBuffer,
          });
        }

        const supabase = createClient();
        await registerPushDevice(supabase, {
          athleteId,
          platform: "web",
          token: JSON.stringify(subscription),
          deviceLabel: navigator.userAgent.includes("Mobile")
            ? "Mobile browser"
            : "Desktop browser",
        });
      } catch {
        // Push registration failed — not critical, silent no-op
      }
    })();
  }, [athleteId]);
}
