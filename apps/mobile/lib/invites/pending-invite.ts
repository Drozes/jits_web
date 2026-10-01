/**
 * Pre-auth invite persistence (jr_be spec 016, contract section 6).
 *
 * An invite captured before sign-in (link, paste or code) is stored here so it
 * survives signup, setup and an app kill, then consumed by `app/index.tsx`
 * before the Home / setup redirect. TTL: 7 days for a token, 30 minutes for a
 * code. Every read and write is wrapped: storage can be unavailable, and a
 * broken record must never block launch.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { isInviteToken, normalizeInviteCode } from "@jits/shared/utils";

export const PENDING_INVITE_KEY = "elorated.invite.pending.v1";
export const PENDING_EVENTS_KEY = "elorated.invite.events.v1";
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CODE_TTL_MS = 30 * 60 * 1000;
const MAX_EVENTS = 20;

export type PendingGateway = "universal_link" | "paste" | "code" | "qr";

export interface PendingInvite {
  token: string | null;
  code: string | null;
  gateway: PendingGateway;
  first_touch_at: string;
  expires_at: string;
}

/** Build the record for a capture now. Null when the input is not an invite. */
export function makePendingInvite(
  input: { token?: string | null; code?: string | null },
  gateway: PendingGateway,
  now: Date = new Date(),
): PendingInvite | null {
  const token = isInviteToken(input.token) ? input.token : null;
  const code = token ? null : normalizeInviteCode(input.code);
  if (!token && !code) return null;
  return {
    token,
    code,
    gateway,
    first_touch_at: now.toISOString(),
    expires_at: new Date(now.getTime() + (token ? TOKEN_TTL_MS : CODE_TTL_MS)).toISOString(),
  };
}

/** Validate a stored record; null when malformed or expired. */
export function parsePendingInvite(raw: string | null, now: Date = new Date()): PendingInvite | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<PendingInvite>;
    const token = isInviteToken(v.token) ? v.token : null;
    const code = token ? null : normalizeInviteCode(v.code ?? null);
    if (!token && !code) return null;
    const expires = Date.parse(v.expires_at ?? "");
    if (!Number.isFinite(expires) || expires <= now.getTime()) return null;
    const gateway: PendingGateway =
      v.gateway === "paste" || v.gateway === "code" || v.gateway === "qr" ? v.gateway : "universal_link";
    const firstTouch = Date.parse(v.first_touch_at ?? "");
    return {
      token,
      code,
      gateway,
      first_touch_at: Number.isFinite(firstTouch) ? new Date(firstTouch).toISOString() : now.toISOString(),
      expires_at: new Date(expires).toISOString(),
    };
  } catch {
    return null;
  }
}

/**
 * Store a capture. First touch is kept when the same invite is captured again
 * (a second tap on the link), and a newer, different invite replaces an older
 * one (last capture wins on the device; the server keeps first attribution).
 */
export async function savePendingInvite(next: PendingInvite): Promise<void> {
  try {
    const current = parsePendingInvite(await AsyncStorage.getItem(PENDING_INVITE_KEY));
    const same = current && current.token === next.token && current.code === next.code;
    const record = same ? { ...next, first_touch_at: current.first_touch_at } : next;
    await AsyncStorage.setItem(PENDING_INVITE_KEY, JSON.stringify(record));
  } catch {
    // Storage unavailable: the invite still works for this launch via the route.
  }
}

/** The pending invite, or null. Clears an expired or malformed record. */
export async function loadPendingInvite(now: Date = new Date()): Promise<PendingInvite | null> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_INVITE_KEY);
    const parsed = parsePendingInvite(raw, now);
    if (raw && !parsed) await AsyncStorage.removeItem(PENDING_INVITE_KEY);
    return parsed;
  } catch {
    return null;
  }
}

export async function clearPendingInvite(): Promise<void> {
  try {
    await AsyncStorage.removeItem(PENDING_INVITE_KEY);
  } catch {
    // Nothing to do; an orphan record expires on its own.
  }
}

// ---------------------------------------------------------------------------
// Buffered `token_captured` events (flushed after sign-in).

export interface BufferedInviteEvent {
  token: string | null;
  captured_at: string;
  gateway: PendingGateway;
}

export async function bufferTokenCaptured(event: BufferedInviteEvent): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_EVENTS_KEY);
    const list = raw ? (JSON.parse(raw) as BufferedInviteEvent[]) : [];
    const next = [...(Array.isArray(list) ? list : []), event].slice(-MAX_EVENTS);
    await AsyncStorage.setItem(PENDING_EVENTS_KEY, JSON.stringify(next));
  } catch {
    // Telemetry only.
  }
}

/** Take (and clear) the buffered events. */
export async function takeBufferedEvents(): Promise<BufferedInviteEvent[]> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_EVENTS_KEY);
    await AsyncStorage.removeItem(PENDING_EVENTS_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? (list as BufferedInviteEvent[]) : [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Push permission waits for an invitee's first match (plan section 5: "Push
// permission is asked after the first match, not before"), so the location
// prompt at the claim is the only system prompt on the way in.

export const DEFER_PUSH_KEY = "elorated.invite.deferPush.v1";

export async function deferPushUntilFirstMatch(): Promise<void> {
  try {
    await AsyncStorage.setItem(DEFER_PUSH_KEY, "1");
  } catch {
    // Worst case the prompt comes early, as for any other athlete.
  }
}

export async function isPushDeferred(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(DEFER_PUSH_KEY)) === "1";
  } catch {
    return false;
  }
}

export async function clearPushDeferral(): Promise<void> {
  try {
    await AsyncStorage.removeItem(DEFER_PUSH_KEY);
  } catch {
    // Nothing to do.
  }
}
