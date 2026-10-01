"use client";

import { useEffect, useState } from "react";
import { sendLandingEvent } from "@/lib/invites/beacon";
import type { InAppBrowser } from "@/lib/invites/types";
import { CAPS_LABEL } from "./styles";

interface InviteCodeBlockProps {
  token: string;
  code: string;
  inAppBrowser: InAppBrowser;
}

/** The short code, shown large; tap to copy it for the app's code entry. */
export function InviteCodeBlock({ token, code, inAppBrowser }: InviteCodeBlockProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    sendLandingEvent(token, "code_viewed", inAppBrowser);
  }, [token, inAppBrowser]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (some in-app browsers): the code stays readable.
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`Challenge code ${code}. Tap to copy.`}
      style={{
        width: "100%",
        background: "var(--bg-elevated)",
        border: "1px solid var(--border-hairline)",
        borderRadius: "var(--radius-md)",
        padding: "var(--space-4)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "var(--space-2)",
        cursor: "pointer",
      }}
    >
      <span style={CAPS_LABEL}>Challenge code</span>
      <span
        data-testid="invite-code"
        style={{
          fontFamily: "var(--font-mono)",
          fontVariantNumeric: "tabular-nums",
          fontWeight: 700,
          fontSize: "clamp(36px, 11vw, 48px)",
          letterSpacing: "0.08em",
          color: "var(--text-primary)",
          lineHeight: 1,
        }}
      >
        {code}
      </span>
      <span aria-live="polite" style={{ ...CAPS_LABEL, color: copied ? "var(--text-primary)" : "var(--text-tertiary)" }}>
        {copied ? "Copied" : "Tap to copy"}
      </span>
    </button>
  );
}
