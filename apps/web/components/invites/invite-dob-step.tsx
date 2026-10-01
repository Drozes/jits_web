"use client";

import { useId, useState } from "react";
import { checkDateOfBirth, DOB_INVALID_COPY, UNDERAGE_COPY, utcTodayYmd } from "@jits/shared/utils";
import type { InviteOutcome } from "@/lib/invites/outcome-copy";
import { BODY_TEXT, CAPS_LABEL, PRIMARY_CTA } from "./styles";

type DobOutcome = Extract<InviteOutcome, { kind: "dob" }>;

interface InviteDobStepProps {
  outcome: DobOutcome;
  pending: boolean;
  onSubmit: (dateOfBirth: string) => void;
}

/**
 * `dob_required` (contract 7): an account from before date of birth was
 * required. Ask for it inline; the parent saves it and retries the claim.
 * This form holds the surface's one red CTA.
 */
export function InviteDobStep({ outcome, pending, onSubmit }: InviteDobStepProps) {
  const inputId = useId();
  const errorId = useId();
  const [value, setValue] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const error = localError ?? outcome.error;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const check = checkDateOfBirth(value);
    if (check !== "ok") {
      // An under-16 date (often a mistyped year) is never sent: saved, it
      // would be permanent and the claim would dead-end on `underage`.
      setLocalError(check === "underage" ? UNDERAGE_COPY : DOB_INVALID_COPY);
      return;
    }
    setLocalError(null);
    onSubmit(value);
  };

  return (
    <form onSubmit={submit} noValidate data-testid="invite-dob" style={CARD}>
      <span style={CAPS_LABEL}>{outcome.title}</span>
      <p style={{ ...BODY_TEXT, color: "var(--text-primary)", fontSize: "var(--size-body-l)" }}>{outcome.body}</p>
      <label htmlFor={inputId} style={{ ...BODY_TEXT, fontSize: "var(--size-body)" }}>
        Date of birth
      </label>
      <input
        id={inputId}
        type="date"
        required
        min="1900-01-01"
        max={utcTodayYmd()}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setLocalError(null);
        }}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        style={INPUT}
      />
      {error && (
        <p id={errorId} role="alert" style={{ ...BODY_TEXT, color: "var(--state-negative)" }}>
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending || !value}
        style={{ ...PRIMARY_CTA, opacity: pending || !value ? "var(--opacity-disabled)" : 1 }}
      >
        {pending ? "Saving..." : "Save and accept"}
      </button>
    </form>
  );
}

const CARD: React.CSSProperties = {
  background: "var(--bg-elevated)",
  borderLeft: "2px solid var(--text-primary)",
  borderRadius: "var(--radius-md)",
  padding: "var(--space-4)",
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-3)",
};

const INPUT: React.CSSProperties = {
  width: "100%",
  minHeight: 48,
  padding: "var(--space-3) var(--space-4)",
  background: "var(--bg-secondary)",
  color: "var(--text-primary)",
  border: "1px solid var(--border-hairline-strong)",
  borderRadius: "var(--radius-sm)",
  fontFamily: "var(--font-mono)",
  fontSize: "var(--size-body)",
  fontVariantNumeric: "tabular-nums",
  colorScheme: "dark light",
};
