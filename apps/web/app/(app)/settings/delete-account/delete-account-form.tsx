"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plate } from "@/components/ui/elo-system";
import { createClient } from "@/lib/supabase/client";
import { DELETE_CONFIRM_WORD, deleteAccount, isDeleteConfirmed } from "./delete-account-api";

const FAILED = "We couldn't delete your account. Check your connection and try again.";
const EXPIRED = "Your session expired. Sign in again, then delete your account.";

/** Two steps: read and Continue, then type DELETE and confirm. */
export function DeleteAccountForm() {
  const router = useRouter();
  const [step, setStep] = useState<"explain" | "confirm">("explain");
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);
  const ready = isDeleteConfirmed(typed);

  async function onDelete(e: React.FormEvent) {
    e.preventDefault();
    if (!ready || deleting) return;
    setDeleting(true);
    const supabase = createClient();
    const result = await deleteAccount(supabase);
    if (!result.ok) {
      setDeleting(false);
      toast.error(result.code === "not_authenticated" ? EXPIRED : FAILED);
      return;
    }
    // The auth user is gone; clear the local session (a server error here is
    // expected and harmless) and leave the app.
    await supabase.auth.signOut({ scope: "local" });
    toast.success("Your account was deleted.");
    router.replace("/login");
  }

  return (
    <div className="flex flex-col animate-page-in" style={{ gap: "var(--space-5)" }}>
      <Plate>
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          <h2 style={headingStyle}>DELETE ACCOUNT</h2>
          <p style={{ ...bodyStyle, color: "var(--text-primary)" }}>
            This permanently deletes your profile, matches and ELO. This can&apos;t be undone.
          </p>
          <p style={bodyStyle}>
            Your name, photo, weight, birthday, Instagram, push devices and messages are erased and
            you leave the rankings. Opponents keep their own results, shown against a deleted
            athlete.
          </p>
        </div>
      </Plate>

      {step === "explain" ? (
        <button type="button" onClick={() => setStep("confirm")} style={ctaStyle(false)}>
          CONTINUE
        </button>
      ) : (
        <form onSubmit={onDelete} style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          <label htmlFor="delete-confirm" style={labelStyle}>
            TYPE {DELETE_CONFIRM_WORD} TO CONFIRM
          </label>
          <input
            id="delete-confirm"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={DELETE_CONFIRM_WORD}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            disabled={deleting}
            style={inputStyle}
          />
          <button type="submit" disabled={!ready || deleting} style={ctaStyle(!ready || deleting)}>
            {deleting ? "DELETING..." : "DELETE ACCOUNT"}
          </button>
        </form>
      )}

      <button type="button" onClick={() => router.back()} disabled={deleting} style={ghostStyle}>
        KEEP MY ACCOUNT
      </button>
    </div>
  );
}

const headingStyle: React.CSSProperties = {
  fontFamily: "var(--font-heading)",
  fontSize: "var(--size-heading-m)",
  fontWeight: 700,
  color: "var(--text-primary)",
  letterSpacing: "var(--ls-caps)",
  margin: 0,
};

const bodyStyle: React.CSSProperties = {
  fontFamily: "var(--font-body)",
  fontSize: "var(--size-body-s)",
  color: "var(--text-secondary)",
  lineHeight: "var(--lh-loose)",
  margin: 0,
};

const labelStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "var(--size-num-xs)",
  color: "var(--text-tertiary)",
  letterSpacing: "var(--ls-caps-l)",
};

const inputStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: 16,
  color: "var(--text-primary)",
  background: "var(--bg-elevated)",
  border: "1px solid var(--border-hairline-strong)",
  borderRadius: "var(--radius-sm)",
  padding: "var(--space-3)",
};

function ctaStyle(disabled: boolean): React.CSSProperties {
  return {
    fontFamily: "var(--font-heading)",
    fontSize: 14,
    fontWeight: 700,
    letterSpacing: "var(--ls-caps-l)",
    color: "var(--text-on-accent)",
    background: "var(--accent-cta)",
    border: "none",
    borderRadius: "var(--radius-sm)",
    padding: "var(--space-4) var(--space-5)",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
  };
}

const ghostStyle: React.CSSProperties = {
  fontFamily: "var(--font-heading)",
  fontSize: 14,
  fontWeight: 700,
  letterSpacing: "var(--ls-caps-l)",
  color: "var(--text-secondary)",
  background: "transparent",
  border: "none",
  padding: "var(--space-3)",
  cursor: "pointer",
};
