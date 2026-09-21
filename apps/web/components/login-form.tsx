"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Wordmark } from "@/components/ui/elo-system";
import { createClient } from "@/lib/supabase/client";
import { EmailInput } from "@/components/auth/email-input";
import { PasswordInput } from "@/components/auth/password-input";
import { GoogleOAuthButton } from "@/components/auth/google-oauth-button";
import { AppleOAuthButton } from "@/components/auth/apple-oauth-button";

/** Mirrors `sign-up-form.tsx` so the two email-auth surfaces read identically. */
const FIELD_LABEL_STYLE: React.CSSProperties = {
  fontFamily: "var(--font-heading)",
  fontSize: "var(--size-label-s)",
  textTransform: "uppercase",
  letterSpacing: "var(--ls-caps-l)",
  color: "var(--text-tertiary)",
  fontWeight: 700,
};

const FIELD_INPUT_STYLE: React.CSSProperties = {
  background: "var(--bg-elevated)",
  border: "1px solid var(--border-hairline-strong)",
  borderRadius: "var(--radius-xs)",
  padding: "var(--space-3) var(--space-4)",
  color: "var(--text-primary)",
  fontFamily: "var(--font-mono)",
  fontVariantNumeric: "tabular-nums",
  fontSize: "var(--size-num-m)",
  width: "100%",
  height: "auto",
  transition: "border-color var(--motion-hover)",
};

/**
 * Drops the shadcn `Input` drop shadow (brand rule: no elevation) without
 * killing its focus ring, which an inline `boxShadow` would also erase.
 */
const FIELD_INPUT_CLASS = "shadow-none";

const SECONDARY_BUTTON_STYLE: React.CSSProperties = {
  background: "var(--bg-elevated)",
  color: "var(--text-primary)",
  border: "1px solid var(--border-hairline-strong)",
  borderRadius: "var(--radius-sm)",
  padding: "var(--space-3) var(--space-5)",
  fontSize: "var(--size-label-l)",
  letterSpacing: "var(--ls-caps)",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "var(--space-2)",
  width: "100%",
  textDecoration: "none",
  transition: "background var(--motion-hover), border-color var(--motion-hover)",
};

/**
 * Supabase returns the same `invalid_credentials` for an unknown email and a
 * wrong password, so surfacing it verbatim leaks nothing. Everything else falls
 * back to a generic line rather than echoing a raw API string at the user.
 */
function signInErrorMessage(error: { code?: string; message?: string }): string {
  const code = error.code ?? "";
  const message = error.message ?? "";

  if (code === "email_not_confirmed" || /email not confirmed/i.test(message)) {
    return "Confirm your email before signing in. Check your inbox for the verification link.";
  }
  if (code === "invalid_credentials" || /invalid login credentials/i.test(message)) {
    return "Incorrect email or password.";
  }
  if (code === "over_request_rate_limit" || /rate limit/i.test(message)) {
    return "Too many attempts. Wait a moment and try again.";
  }
  return "Could not sign you in. Please try again.";
}

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }

    setIsLoading(true);
    const { error: signInError } = await createClient().auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInError) {
      setError(signInErrorMessage(signInError));
      setIsLoading(false);
      return;
    }

    // `/` is the app's single post-auth destination (same as the OAuth callback
    // and `eua-form`): `requireAthlete()` there sends a pending athlete to /eua
    // and a user with no athlete row to /signup. refresh() lets the server
    // components re-read the session cookie the browser client just wrote.
    router.push("/");
    router.refresh();
  };

  return (
    <div
      style={{
        minHeight: "100svh",
        background: "var(--bg-primary)",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "var(--space-5)",
      }}
    >
      <div style={{ width: "100%", maxWidth: 360, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginBottom: "var(--space-8)" }}>
          <Wordmark size="hero" />
          <div
            style={{
              marginTop: "var(--space-3)",
              fontFamily: "var(--font-mono)",
              fontSize: "var(--size-num-xs)",
              color: "var(--text-tertiary)",
              textTransform: "uppercase",
              letterSpacing: "var(--ls-caps-l)",
            }}
          >
            What&apos;s your number?
          </div>
        </div>

        <form
          onSubmit={handleSignIn}
          style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}
        >
          <EmailInput
            value={email}
            onChange={setEmail}
            disabled={isLoading}
            inputStyle={FIELD_INPUT_STYLE}
            inputClassName={FIELD_INPUT_CLASS}
            labelStyle={FIELD_LABEL_STYLE}
          />

          <PasswordInput
            id="password"
            label="Password"
            autoComplete="current-password"
            value={password}
            onChange={setPassword}
            showToggle
            disabled={isLoading}
            inputStyle={FIELD_INPUT_STYLE}
            inputClassName={FIELD_INPUT_CLASS}
            labelStyle={FIELD_LABEL_STYLE}
          />

          {error && (
            <p
              role="alert"
              style={{
                fontFamily: "var(--font-body)",
                fontSize: "var(--size-body-s)",
                color: "var(--state-negative)",
              }}
            >
              {error}
            </p>
          )}

          {/* The one Signal Red CTA on this surface. */}
          <button
            type="submit"
            disabled={isLoading}
            className="font-heading font-bold uppercase"
            style={{
              background: "var(--accent-cta)",
              color: "var(--text-on-accent)",
              border: "1px solid transparent",
              borderRadius: "var(--radius-sm)",
              padding: "var(--space-3) var(--space-5)",
              fontSize: "var(--size-label-l)",
              letterSpacing: "var(--ls-caps)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "100%",
              cursor: isLoading ? "not-allowed" : "pointer",
              opacity: isLoading ? "var(--opacity-disabled)" : 1,
              transition: "background var(--motion-hover)",
            }}
          >
            {isLoading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <Divider label="Or" />

        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          <GoogleOAuthButton disabled={isLoading} onError={setError} />
          <AppleOAuthButton disabled={isLoading} onError={setError} />

          <Link
            href="/signup"
            className="font-heading font-bold uppercase"
            style={SECONDARY_BUTTON_STYLE}
          >
            Register with Email
          </Link>

          <Link
            href="/forgot-password"
            className="font-heading font-bold uppercase"
            style={{
              background: "transparent",
              color: "var(--text-secondary)",
              border: "1px solid transparent",
              borderRadius: "var(--radius-sm)",
              padding: "var(--space-3) var(--space-5)",
              fontSize: "var(--size-label-l)",
              letterSpacing: "var(--ls-caps)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "100%",
              textDecoration: "none",
              transition: "color var(--motion-hover)",
            }}
          >
            Forgot password?
          </Link>
        </div>
      </div>
    </div>
  );
}

function Divider({ label }: { label: string }) {
  const rule = { height: 1, flex: 1, background: "var(--border-hairline)" };

  return (
    <div
      aria-hidden="true"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-3)",
        margin: "var(--space-5) 0",
      }}
    >
      <span style={rule} />
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "var(--size-num-xs)",
          color: "var(--text-tertiary)",
          textTransform: "uppercase",
          letterSpacing: "var(--ls-caps-l)",
        }}
      >
        {label}
      </span>
      <span style={rule} />
    </div>
  );
}
