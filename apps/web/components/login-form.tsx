"use client";

import Link from "next/link";
import { useState } from "react";
import { Wordmark } from "@/components/ui/elo-system";
import { GoogleOAuthButton } from "@/components/auth/google-oauth-button";
import { AppleOAuthButton } from "@/components/auth/apple-oauth-button";

export function LoginForm() {
  const [error, setError] = useState<string | null>(null);

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
        <div
          style={{
            textAlign: "center",
            marginBottom: "var(--space-12)",
          }}
        >
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

        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          <Link
            href="/signup"
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
              gap: "var(--space-2)",
              width: "100%",
              textDecoration: "none",
              transition: "background var(--motion-hover)",
            }}
          >
            Register with Email
          </Link>

          <GoogleOAuthButton onError={setError} />
          <AppleOAuthButton onError={setError} />

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

          {error && (
            <p
              style={{
                marginTop: "var(--space-2)",
                fontFamily: "var(--font-body)",
                fontSize: "var(--size-body-s)",
                color: "var(--state-negative)",
                textAlign: "center",
              }}
            >
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
