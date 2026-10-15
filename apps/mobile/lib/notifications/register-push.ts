/**
 * Push notification registration.
 *
 * Mirrors `apps/web/hooks/use-push-registration.ts` but uses the Expo Push
 * service. Steps:
 *   1. Ensure a default Android notification channel exists.
 *   2. Request permission (silently if already granted).
 *   3. Fetch the Expo push token (a physical iOS device; on Android an
 *      emulator with Google Play services also gets an FCM token).
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
import { darkTokens } from "../tokens";
import type { SupabaseClient } from "@supabase/supabase-js";
import { registerPushDevice, removePushDeviceByToken } from "@jits/shared/api/mutations";

/** The token this process registered for the signed-in athlete (for sign-out). */
let registeredToken: string | null = null;
/**
 * Bumped by every sign-out. A registration that started before a sign-out
 * and finishes after it must not store its token: the next sign-out would
 * then try to delete a row that belongs to the previous account.
 */
let signOutGeneration = 0;

/** Sign-out waits at most this long for the unregister write. */
export const UNREGISTER_PUSH_TIMEOUT_MS = 2_000;

/**
 * Sign-out: delete this device's push registration while the session can
 * still write it, so the previous athlete's pushes never reach the next
 * account on a shared device. Bounded (never blocks sign-out for long) and
 * never throws; a no-op when nothing was registered in this process.
 */
export async function unregisterPushDeviceOnSignOut(supabase: SupabaseClient): Promise<void> {
  signOutGeneration += 1;
  const token = registeredToken;
  registeredToken = null;
  if (!token) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      removePushDeviceByToken(supabase, token),
      new Promise((resolve) => {
        timer = setTimeout(resolve, UNREGISTER_PUSH_TIMEOUT_MS);
      }),
    ]);
  } catch {
    // Best effort: the row is left behind, as before this change.
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Test-only. */
export function __setRegisteredPushTokenForTests(token: string | null): void {
  registeredToken = token;
}

/** Test-only. */
export function __getRegisteredPushTokenForTests(): string | null {
  return registeredToken;
}

export type RegisterPushResult =
  | { ok: true; token: string }
  | {
      ok: false;
      reason:
        | "not_a_device"
        | "permission_denied"
        | "no_project_id"
        | "token_failed"
        | "register_failed";
      message?: string;
    };

/**
 * The Android notification channel every push is posted to. The id MUST stay
 * "default": the jr_be push function sends `channelId: 'default'`
 * (jr_be-hfy), and a push to a channel that does not exist is dropped on
 * Android 8+.
 */
export const ANDROID_CHANNEL_ID = "default";

/**
 * Creates (or updates) the default Android channel; a no-op elsewhere.
 * Idempotent, so it runs at startup (`app/_layout.tsx`) as well as on
 * registration: the channel then exists before any push arrives even when
 * registration never ran.
 */
export async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: "Default",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    // Signal Red, the brand red (was Tailwind red-500). Android keeps an
    // existing channel's light color, so this reaches new installs only.
    lightColor: darkTokens.accentCta,
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
  const generation = signOutGeneration;
  // iOS simulators cannot get a push token. Android emulators with Google
  // Play services can (FCM), so they register like a device (jits-mafl.1).
  if (!Device.isDevice && Platform.OS !== "android") {
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
      // `no_project_id` only when there was genuinely no project id to pass;
      // any other failure (no FCM config, network, Play services) is the
      // token fetch itself.
      reason: projectId ? "token_failed" : "no_project_id",
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

  // Signed out while this was in flight: the token is not this session's.
  if (generation === signOutGeneration) registeredToken = token;
  return { ok: true, token };
}
