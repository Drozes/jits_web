/**
 * Consent before third-party AI processing (App Review 5.1.2(i), jits-rog5.11).
 *
 * A match video goes to Google Gemini (key moments, highlights) and stills to
 * OpenAI (the avatar), so the athlete must tap "Allow and film" before the
 * first recording. The server column `athletes.ai_processing_consent_at` is
 * the record; this store mirrors it for the signed-in athlete and caches it
 * in AsyncStorage per athlete (`ai-consent.<id>`), so an athlete who already
 * agreed never sees the sheet flash while the server read is in flight.
 *
 * Two texts, two versions (jits-o47s.46): the athlete's sheet and the
 * timekeeper's each count only their own current version, held together in
 * the one server column (`composeConsentVersion` / `hasConsentedToText` in
 * `@jits/shared/api/moderation`). `consentAt` is the athlete text's consent
 * (the record switch, Settings), `timekeeperConsentAt` the timekeeper
 * text's (the timekeep sheet, the timekeeper face-off camera). Uploads need
 * either one: the clip was only recorded behind the gate of the role it was
 * filmed in, and the upload manager does not know that role.
 *
 * Recording only happens with consent: `useEffectiveRecordingOptIn()` is the
 * "Record from my phone" choice AND consent, so a toggle remembered ON from
 * before this release reads OFF until the athlete allows. Withdrawing consent
 * in the app is a follow-up (today: email, Privacy Policy section 7).
 */
import { useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  type AiConsentText,
  composeConsentVersion,
  getAiProcessingConsent,
  hasConsentedToText,
  recordAiProcessingConsent,
} from "@jits/shared/api/moderation";
import { moderationClient } from "@/lib/moderation/client";
import { useRecordingOptIn } from "@/lib/match-flow/recording-optin";

export type { AiConsentText };

export interface AiConsentState {
  athleteId: string | null;
  /** When the athlete text was agreed to (current version); null when not (or not known yet). */
  consentAt: string | null;
  /** When the timekeeper text was agreed to (current version); null when not. */
  timekeeperConsentAt: string | null;
  /** The stored version as read or recorded (both texts' tokens), for composing the next one. */
  version: string | null;
  /** The cache or the server has answered for this athlete. */
  known: boolean;
}

const EMPTY: AiConsentState = { athleteId: null, consentAt: null, timekeeperConsentAt: null, version: null, known: false };

export const aiConsentCacheKey = (athleteId: string) => `ai-consent.${athleteId}`;

let state: AiConsentState = EMPTY;
let generation = 0;
/** Bumped by every consent recorded on this device: a read that started before it never undoes it. */
let recordedSeq = 0;
const listeners = new Set<() => void>();

function set(next: AiConsentState) {
  state = next;
  for (const l of [...listeners]) l();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

const snapshot = () => state;

/**
 * Only consent to the text this build shows counts: a consent to an older
 * version of `text` (or none) asks again.
 */
export function currentConsentAt(consentAt: string | null, version: string | null, text: AiConsentText = "athlete"): string | null {
  return consentAt && hasConsentedToText(version, text) ? consentAt : null;
}

type Stored = Pick<AiConsentState, "consentAt" | "timekeeperConsentAt" | "version">;

function storedOf(at: string | null, version: string | null): Stored {
  const consentAt = currentConsentAt(at, version, "athlete");
  const timekeeperConsentAt = currentConsentAt(at, version, "timekeeper");
  return { consentAt, timekeeperConsentAt, version: consentAt || timekeeperConsentAt ? version : null };
}

const anyConsent = (s: Stored) => s.consentAt !== null || s.timekeeperConsentAt !== null;

/** The cache holds `{ at, version }`; anything else (or no current version) reads as none. */
function parseCached(raw: string | null): Stored | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as { at?: unknown; version?: unknown };
    if (typeof v.at !== "string" || typeof v.version !== "string") return null;
    const stored = storedOf(v.at, v.version);
    return anyConsent(stored) ? stored : null;
  } catch {
    return null;
  }
}

function cache(athleteId: string, at: string | null, stored: Stored) {
  const key = aiConsentCacheKey(athleteId);
  void (
    at && anyConsent(stored)
      ? AsyncStorage.setItem(key, JSON.stringify({ at, version: stored.version }))
      : AsyncStorage.removeItem(key)
  ).catch(() => undefined);
}

/**
 * Load consent for `athleteId` (null clears: sign-out): the device cache
 * first, then the server, which wins. Never rejects.
 */
export async function loadAiConsent(athleteId: string | null): Promise<void> {
  if (athleteId !== state.athleteId) {
    generation += 1;
    set({ ...EMPTY, athleteId });
  }
  if (!athleteId) return;
  const gen = generation;
  const seq = recordedSeq;
  try {
    const cached = parseCached(await AsyncStorage.getItem(aiConsentCacheKey(athleteId)));
    // A consent recorded meanwhile wins over the cache.
    if (gen === generation && seq === recordedSeq && cached) set({ athleteId, ...cached, known: true });
  } catch {
    // No cache: the server read decides.
  }
  const res = await getAiProcessingConsent(moderationClient(), athleteId);
  if (gen !== generation || !res.ok) return;
  // Consent recorded on this device while the read was in flight: the read
  // predates it and must not undo it.
  if (seq !== recordedSeq) return;
  // Otherwise the server wins, including a NULL: consent withdrawn (cleared
  // by the team on request) stops recording on this device too, for both texts.
  const stored = storedOf(res.data.consentAt, res.data.version);
  set({ athleteId, ...stored, known: true });
  cache(athleteId, res.data.consentAt, stored);
}

/**
 * "Allow and film" on the `text` sheet: record consent on the server (keeping
 * a current consent to the other text), then mirror it. The version is
 * composed from a fresh server read, so a consent to the other text given
 * on another device since this one last read is never dropped; when that
 * read fails, from the last version this device knows.
 */
export async function giveAiConsent(text: AiConsentText = "athlete"): Promise<boolean> {
  const athleteId = state.athleteId;
  if (!athleteId) return false;
  const fresh = await getAiProcessingConsent(moderationClient(), athleteId);
  if (state.athleteId !== athleteId) return false;
  const prior = fresh.ok ? (fresh.data.consentAt ? fresh.data.version : null) : state.version;
  const version = composeConsentVersion(prior, text);
  const res = await recordAiProcessingConsent(moderationClient(), version);
  if (!res.ok) return false;
  if (state.athleteId !== athleteId) return false;
  recordedSeq += 1;
  const stored = storedOf(res.data, version);
  set({ athleteId, ...stored, known: true });
  cache(athleteId, res.data, stored);
  return true;
}

function consentOf(s: AiConsentState, text: AiConsentText): string | null {
  return text === "timekeeper" ? s.timekeeperConsentAt : s.consentAt;
}

/** The signed-in athlete agreed to the current `text` (default: the athlete's). */
export function hasAiConsent(text: AiConsentText = "athlete"): boolean {
  return consentOf(state, text) !== null;
}

/**
 * Consent of this athlete in particular to `text` (default: the athlete's),
 * so an account switch can never act on one athlete's behalf under
 * another's consent.
 */
export function hasAiConsentFor(athleteId: string | null | undefined, text: AiConsentText = "athlete"): boolean {
  return !!athleteId && state.athleteId === athleteId && consentOf(state, text) !== null;
}

/**
 * Consent of this athlete to either text: the upload gate (the upload
 * manager passes its job owner). A clip exists only because the gate of the
 * role it was filmed in passed, and a job does not carry that role.
 */
export function hasAnyAiConsentFor(athleteId: string | null | undefined): boolean {
  return hasAiConsentFor(athleteId, "athlete") || hasAiConsentFor(athleteId, "timekeeper");
}

/** The cache or the server has answered for this athlete (given or not). */
export function isAiConsentKnownFor(athleteId: string | null | undefined): boolean {
  return !!athleteId && state.athleteId === athleteId && state.known;
}

/** When this athlete's current consent (either text) was given (ms), or null. */
export function aiConsentGivenAtMs(athleteId: string | null | undefined): number | null {
  if (!hasAnyAiConsentFor(athleteId)) return null;
  const at = state.consentAt ?? state.timekeeperConsentAt;
  if (!at) return null;
  const t = Date.parse(at);
  return Number.isNaN(t) ? null : t;
}

export function useAiConsent(): AiConsentState {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** `athleteId` agreed to `text` (default: the athlete's), from a `useAiConsent()` snapshot. */
export function consentedIn(s: AiConsentState, athleteId: string | null | undefined, text: AiConsentText = "athlete"): boolean {
  return !!athleteId && s.athleteId === athleteId && consentOf(s, text) !== null;
}

/** "Record from my phone", but only once THIS athlete allowed AI processing (the athlete text). */
export function useEffectiveRecordingOptIn(athleteId: string | null | undefined): boolean {
  const optIn = useRecordingOptIn();
  const s = useAiConsent();
  return optIn && consentedIn(s, athleteId, "athlete");
}

/**
 * Tests only. A `consentAt` alone stands for both texts (most suites only
 * need "consent given"); pass `timekeeperConsentAt: null` to split them.
 */
export function __resetAiConsentForTests(next?: Partial<AiConsentState>): void {
  generation += 1;
  const consentAt = next?.consentAt ?? null;
  const timekeeperConsentAt = next && "timekeeperConsentAt" in next ? (next.timekeeperConsentAt ?? null) : consentAt;
  set({ ...EMPTY, ...next, consentAt, timekeeperConsentAt });
}
