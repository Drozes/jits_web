import * as React from "react";
import { Platform } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "../supabase/client";

/**
 * Sign in with Apple (App Store guideline 4.8, jits-b3js.9).
 *
 * Native flow: Apple returns an identity token whose `nonce` claim is the
 * SHA-256 of a random value we generate; Supabase re-hashes the RAW value we
 * pass to `signInWithIdToken` and compares, so a replayed token is useless.
 * Apple only returns the full name on the very first authorization for this
 * app, and never puts it in the token, so we copy it into the auth user's
 * metadata (`given_name`, `family_name`, `full_name`) right away; setup reads
 * it to prefill first and last name.
 */

export type AppleSignInResult =
  | { status: "signed_in" }
  | { status: "cancelled" }
  | { status: "error"; message: string };

const CANCEL_CODES = new Set(["ERR_REQUEST_CANCELED", "ERR_CANCELED"]);

export const APPLE_SIGN_IN_FAILED = "Apple sign-in failed. Try again or use email.";

/** Random raw nonce plus its SHA-256 hex digest (what Apple receives). */
export async function createNonce(): Promise<{ raw: string; hashed: string }> {
  const raw = Crypto.randomUUID();
  const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, raw);
  return { raw, hashed };
}

/** Name metadata from Apple's first-authorization fullName, or null. */
export function appleNameMetadata(
  fullName: AppleAuthentication.AppleAuthenticationFullName | null | undefined,
): Record<string, string> | null {
  const given = fullName?.givenName?.trim() || "";
  const family = fullName?.familyName?.trim() || "";
  if (!given && !family) return null;
  const meta: Record<string, string> = { full_name: [given, family].filter(Boolean).join(" ") };
  if (given) meta.given_name = given;
  if (family) meta.family_name = family;
  return meta;
}

export async function signInWithApple(
  client: SupabaseClient = supabase,
): Promise<AppleSignInResult> {
  try {
    const nonce = await createNonce();
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: nonce.hashed,
    });
    if (!credential.identityToken) {
      return { status: "error", message: APPLE_SIGN_IN_FAILED };
    }
    const { error } = await client.auth.signInWithIdToken({
      provider: "apple",
      token: credential.identityToken,
      nonce: nonce.raw,
    });
    if (error) {
      // The raw Supabase message ("Unacceptable audience in id_token") is for
      // logs, not people.
      console.warn("[apple] signInWithIdToken failed", error.message);
      return { status: "error", message: APPLE_SIGN_IN_FAILED };
    }

    const meta = appleNameMetadata(credential.fullName);
    if (meta) {
      // Best effort: a failure only loses the setup prefill, never the sign-in.
      const { error: metaError } = await client.auth.updateUser({ data: meta });
      if (metaError) console.warn("[apple] name metadata update failed", metaError.message);
    }
    return { status: "signed_in" };
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code && CANCEL_CODES.has(code)) return { status: "cancelled" };
    return { status: "error", message: APPLE_SIGN_IN_FAILED };
  }
}

/** True on iOS 13+ devices where Sign in with Apple is offered. */
export function useAppleSignInAvailable(): boolean {
  const [available, setAvailable] = React.useState(false);
  React.useEffect(() => {
    if (Platform.OS !== "ios") return;
    let cancelled = false;
    AppleAuthentication.isAvailableAsync()
      .then((ok) => {
        if (!cancelled) setAvailable(ok);
      })
      .catch(() => {
        if (!cancelled) setAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return available;
}
