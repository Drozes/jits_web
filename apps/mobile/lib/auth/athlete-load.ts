/**
 * Pure decision helper for the auth-state machine in `auth-context.tsx`.
 *
 * When `onAuthStateChange` observes a signed-in user, the provider must decide
 * whether it still needs to (re)load that user's athlete-guard row. If so, the
 * loading gate has to be re-armed so `app/index.tsx` does not momentarily see
 * `athlete === null` for a signed-in user and bounce an already-active athlete
 * to `/profile-setup` before the row arrives.
 *
 * Returns true only for a user we have NOT already loaded the athlete for (a
 * fresh sign-in or an account switch), and false for the signed-out case or a
 * repeat event for the same user (e.g. a token refresh), so we never flash the
 * loading gate on routine auth events.
 */
export function needsAthleteLoad(
  nextUserId: string | null,
  loadedForUserId: string | null,
): boolean {
  return nextUserId !== null && nextUserId !== loadedForUserId;
}
