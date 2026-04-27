/**
 * Mounts the `app:online` Presence channel for the current athlete.
 *
 * Renders null. Place inside the existing `<AuthProvider>` in `_layout.tsx`.
 */
import * as React from "react";
import { useAuth } from "@/lib/auth/hooks";
import { useOnlinePresence } from "./use-online-presence";

export function OnlinePresenceBootstrap() {
  const { athlete } = useAuth();

  // Hooks must be called unconditionally; passing an empty id is a no-op
  // because `useOnlinePresence` early-returns when `athleteId` is falsy.
  useOnlinePresence(
    athlete?.id ?? "",
    athlete?.display_name ?? "",
    athlete?.profile_photo_url ?? null,
  );

  return null;
}
