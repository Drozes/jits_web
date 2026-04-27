/**
 * Push notification registration.
 *
 * Mirrors `apps/web/hooks/use-push-registration.ts` but uses the Expo Push
 * service. Steps:
 *   1. Ensure a default Android notification channel exists.
 *   2. Request permission (silently if already granted).
 *   3. Fetch the Expo push token (requires a physical device).
 *   4. Persist the token via the shared `registerPushDevice` mutation.
 *
 * Returns a discriminated `RegisterPushResult` so callers can surface a
 * meaningful error / log line. Does NOT throw on permission denial -- it just
 * returns `{ ok: false, reason: "permission_denied" }`.
 */
import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import type { SupabaseClient } from "@supabase/supabase-js";
import { registerPushDevice } from "@jits/shared/api/mutations";

export type RegisterPushResult =
  | { ok: true; token: string }
  | {
      ok: false;
      reason:
        | "not_a_device"
        | "permission_denied"
        | "no_project_id"
        | "register_failed";
      message?: string;
    };

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("default", {
    name: "Default",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#ef4444",
  });
}

async function ensurePermission(): Promise<boolean> {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  if (existingStatus === "granted") return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

function deviceLabel(): string | undefined {
  const os = Device.osName ?? Platform.OS;
  const model = Device.modelName ?? "device";
  return `${os} - ${model}`;
}

function resolveProjectId(): string | undefined {
  const fromExpoConfig = Constants?.expoConfig?.extra?.eas?.projectId as
    | string
    | undefined;
  const fromEasConfig = (Constants as { easConfig?: { projectId?: string } })
    ?.easConfig?.projectId;
  return fromExpoConfig ?? fromEasConfig;
}

export async function registerForPushNotifications(
  supabase: SupabaseClient,
  athleteId: string,
): Promise<RegisterPushResult> {
  if (!Device.isDevice) {
    return { ok: false, reason: "not_a_device" };
  }

  await ensureAndroidChannel();

  const granted = await ensurePermission();
  if (!granted) return { ok: false, reason: "permission_denied" };

  const projectId = resolveProjectId();

  let token: string;
  try {
    const tokenResponse = projectId
      ? await Notifications.getExpoPushTokenAsync({ projectId })
      : await Notifications.getExpoPushTokenAsync();
    token = tokenResponse.data;
  } catch (err) {
    return {
      ok: false,
      reason: "no_project_id",
      message: err instanceof Error ? err.message : String(err),
    };
  }

  const result = await registerPushDevice(supabase, {
    athleteId,
    platform: "expo",
    token,
    deviceLabel: deviceLabel(),
  });

  if (!result.ok) {
    return {
      ok: false,
      reason: "register_failed",
      message: result.error.message,
    };
  }

  return { ok: true, token };
}
