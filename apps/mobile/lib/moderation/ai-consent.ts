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
import { getAiProcessingConsent, recordAiProcessingConsent } from "@jits/shared/api/moderation";
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

function cache(athleteId: string, consentAt: string | null) {
  const key = aiConsentCacheKey(athleteId);
  void (consentAt ? AsyncStorage.setItem(key, consentAt) : AsyncStorage.removeItem(key)).catch(() => undefined);
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
  try {
    const cached = await AsyncStorage.getItem(aiConsentCacheKey(athleteId));
    // A consent recorded meanwhile (or the server read) wins over the cache.
    if (gen === generation && cached && !state.consentAt) set({ athleteId, consentAt: cached, known: true });
  } catch {
    // No cache: the server read decides.
  }
  const res = await getAiProcessingConsent(moderationClient(), athleteId);
  if (gen !== generation || !res.ok) return;
  // A consent just recorded on this device is never undone by a read that
  // started before it landed.
  const consentAt = res.data.consentAt ?? state.consentAt;
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
  set({ athleteId, consentAt: res.data, known: true });
  cache(athleteId, res.data);
  return true;
}

export function hasAiConsent(): boolean {
  return state.consentAt !== null;
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
