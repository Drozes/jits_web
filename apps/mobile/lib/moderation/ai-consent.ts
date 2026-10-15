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
 * Recording only happens with consent: `useEffectiveRecordingOptIn()` is the
 * "Record from my phone" choice AND consent, so a toggle remembered ON from
 * before this release reads OFF until the athlete allows. Withdrawing consent
 * in the app is a follow-up (today: email, Privacy Policy section 7).
 */
import { useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  AI_PROCESSING_CONSENT_VERSION,
  getAiProcessingConsent,
  recordAiProcessingConsent,
} from "@jits/shared/api/moderation";
import { moderationClient } from "@/lib/moderation/client";
import { useRecordingOptIn } from "@/lib/match-flow/recording-optin";

export interface AiConsentState {
  athleteId: string | null;
  /** When consent was given; null when not given (or not known yet). */
  consentAt: string | null;
  /** The cache or the server has answered for this athlete. */
  known: boolean;
}

const EMPTY: AiConsentState = { athleteId: null, consentAt: null, known: false };

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
 * version (or none) asks again (`AI_PROCESSING_CONSENT_VERSION`).
 */
export function currentConsentAt(consentAt: string | null, version: string | null): string | null {
  return consentAt && version === AI_PROCESSING_CONSENT_VERSION ? consentAt : null;
}

/** The cache holds `{ at, version }`; anything else (or another version) reads as none. */
function parseCached(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as { at?: unknown; version?: unknown };
    return typeof v.at === "string" && typeof v.version === "string" ? currentConsentAt(v.at, v.version) : null;
  } catch {
    return null;
  }
}

function cache(athleteId: string, consentAt: string | null) {
  const key = aiConsentCacheKey(athleteId);
  void (
    consentAt
      ? AsyncStorage.setItem(key, JSON.stringify({ at: consentAt, version: AI_PROCESSING_CONSENT_VERSION }))
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
    if (gen === generation && seq === recordedSeq && cached) set({ athleteId, consentAt: cached, known: true });
  } catch {
    // No cache: the server read decides.
  }
  const res = await getAiProcessingConsent(moderationClient(), athleteId);
  if (gen !== generation || !res.ok) return;
  // Consent recorded on this device while the read was in flight: the read
  // predates it and must not undo it.
  if (seq !== recordedSeq) return;
  // Otherwise the server wins, including a NULL: consent withdrawn (cleared
  // by the team on request) stops recording on this device too.
  const consentAt = currentConsentAt(res.data.consentAt, res.data.version);
  set({ athleteId, consentAt, known: true });
  cache(athleteId, consentAt);
}

/** "Allow and film": record consent on the server, then mirror it. */
export async function giveAiConsent(): Promise<boolean> {
  const athleteId = state.athleteId;
  if (!athleteId) return false;
  const res = await recordAiProcessingConsent(moderationClient());
  if (!res.ok) return false;
  if (state.athleteId !== athleteId) return false;
  recordedSeq += 1;
  set({ athleteId, consentAt: res.data, known: true });
  cache(athleteId, res.data);
  return true;
}

export function hasAiConsent(): boolean {
  return state.consentAt !== null;
}

/**
 * Consent of this athlete in particular (the upload manager passes its job
 * owner), so an account switch can never upload one athlete's clip under
 * another's consent.
 */
export function hasAiConsentFor(athleteId: string | null | undefined): boolean {
  return !!athleteId && state.athleteId === athleteId && state.consentAt !== null;
}

/** When this athlete's current consent was given (ms), or null. */
export function aiConsentGivenAtMs(athleteId: string | null | undefined): number | null {
  if (!hasAiConsentFor(athleteId) || !state.consentAt) return null;
  const t = Date.parse(state.consentAt);
  return Number.isNaN(t) ? null : t;
}

export function useAiConsent(): AiConsentState {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** "Record from my phone", but only once the athlete allowed AI processing. */
export function useEffectiveRecordingOptIn(): boolean {
  const optIn = useRecordingOptIn();
  const { consentAt } = useAiConsent();
  return optIn && consentAt !== null;
}

/** Tests only. */
export function __resetAiConsentForTests(next?: Partial<AiConsentState>): void {
  generation += 1;
  set({ ...EMPTY, ...next });
}
