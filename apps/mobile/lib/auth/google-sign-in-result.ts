/**
 * What a `GoogleSignin.signIn()` resolution means (jits-mafl.2 M10).
 * @react-native-google-signin v16 RESOLVES `{ type: "cancelled", data: null }`
 * when the athlete backs out of the account picker (both platforms): a silent
 * cancel, never "no ID token". A success carries `data.idToken`; the
 * pre-v13 shape carried a top-level `idToken`. Rejections (older cancel codes,
 * Play Services errors) are handled by the caller's catch.
 */
export type GoogleSignInOutcome = { kind: "cancelled" } | { kind: "token"; idToken: string | null };

export function readGoogleSignInResult(result: unknown): GoogleSignInOutcome {
  const r = (result ?? {}) as { type?: string; idToken?: string | null; data?: { idToken?: string | null } | null };
  if (r.type === "cancelled") return { kind: "cancelled" };
  return { kind: "token", idToken: r.idToken ?? r.data?.idToken ?? null };
}
