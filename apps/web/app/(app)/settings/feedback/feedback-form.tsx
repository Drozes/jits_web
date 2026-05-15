"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plate } from "@/components/ui/elo-system";
import { createClient } from "@/lib/supabase/client";

type Category = "bug" | "feature" | "general";

const CATEGORIES: { value: Category; label: string }[] = [
  { value: "bug", label: "BUG" },
  { value: "feature", label: "FEATURE" },
  { value: "general", label: "GENERAL" },
];

export function FeedbackForm() {
  const [category, setCategory] = useState<Category>("general");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const charCount = message.length;
  const isValid = charCount >= 10 && charCount <= 2000;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid) return;
    setSubmitting(true);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const { error } = await supabase.from("feedback").insert({
      athlete_id: user?.id ?? null,
      category,
      message,
    });

    setSubmitting(false);

    if (error) {
      toast.error("Could not submit feedback. Please try again.");
      return;
    }

    setSubmitted(true);
  }

  if (submitted) {
    return (
      <Plate>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "var(--space-4)",
            textAlign: "center",
            padding: "var(--space-6) 0",
          }}
        >
          <p
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: "var(--size-heading-l)",
              fontWeight: 700,
              color: "var(--text-primary)",
              margin: 0,
            }}
          >
            THANK YOU
          </p>
          <p
            style={{
              fontFamily: "var(--font-body)",
              fontSize: "var(--size-body-s)",
              color: "var(--text-secondary)",
              margin: 0,
              lineHeight: "var(--lh-loose)",
            }}
          >
            Your feedback helps us improve ELO RATED.
          </p>
          <button
            type="button"
            onClick={() => {
              setMessage("");
              setCategory("general");
              setSubmitted(false);
            }}
            style={ghostButtonStyle}
          >
            Submit More Feedback
          </button>
        </div>
      </Plate>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-5)",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        <FieldLabel>CATEGORY</FieldLabel>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
          {CATEGORIES.map(({ value, label }) => (
            <CategoryChip
              key={value}
              active={category === value}
              onClick={() => setCategory(value)}
            >
              {label}
            </CategoryChip>
          ))}
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        <FieldLabel>MESSAGE</FieldLabel>
        <textarea
          id="message"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Tell us what you think..."
          rows={6}
          maxLength={2000}
          style={{
            width: "100%",
            resize: "none",
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-hairline)",
            borderRadius: "var(--radius-xs)",
            padding: "var(--space-3)",
            fontFamily: "var(--font-mono)",
            fontSize: "var(--size-num-m)",
            color: "var(--text-primary)",
            lineHeight: "var(--lh-base)",
            outline: "none",
            transition: "border-color var(--motion-hover)",
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = "var(--accent-cta)";
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = "var(--border-hairline)";
          }}
        />
        <p
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "var(--size-num-xs)",
            color:
              charCount > 2000 ? "var(--state-negative)" : "var(--text-tertiary)",
            textAlign: "right",
            margin: 0,
            letterSpacing: "var(--ls-caps-l)",
          }}
        >
          {charCount}/2000
        </p>
      </div>

      <button
        type="submit"
        disabled={!isValid || submitting}
        style={{
          ...primaryButtonStyle,
          opacity: !isValid || submitting ? 0.5 : 1,
          cursor: !isValid || submitting ? "not-allowed" : "pointer",
        }}
      >
        {submitting ? "Submitting..." : "Submit Feedback"}
      </button>
    </form>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: "var(--size-num-xs)",
        color: "var(--text-tertiary)",
        textTransform: "uppercase",
        letterSpacing: "var(--ls-caps-l)",
        lineHeight: 1.2,
      }}
    >
      {children}
    </label>
  );
}

function CategoryChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        fontFamily: "var(--font-heading)",
        fontSize: "var(--size-label-s)",
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "var(--ls-caps)",
        padding: "var(--space-2) var(--space-3)",
        borderRadius: "var(--radius-xs)",
        border: `1px solid ${active ? "var(--accent-cta)" : "var(--border-hairline-strong)"}`,
        background: active ? "var(--bg-elevated-hover)" : "var(--bg-elevated)",
        color: active ? "var(--text-primary)" : "var(--text-secondary)",
        cursor: "pointer",
        transition:
          "background var(--motion-hover), color var(--motion-hover), border-color var(--motion-hover)",
      }}
    >
      {children}
    </button>
  );
}

const primaryButtonStyle: React.CSSProperties = {
  fontFamily: "var(--font-heading)",
  fontSize: "var(--size-label-l)",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "var(--ls-caps)",
  padding: "var(--space-3) var(--space-4)",
  borderRadius: "var(--radius-sm)",
  background: "var(--accent-cta)",
  color: "var(--text-on-accent)",
  border: "none",
  width: "100%",
  transition: "background var(--motion-hover)",
};

const ghostButtonStyle: React.CSSProperties = {
  fontFamily: "var(--font-heading)",
  fontSize: "var(--size-label-l)",
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "var(--ls-caps)",
  padding: "var(--space-2) var(--space-4)",
  borderRadius: "var(--radius-sm)",
  background: "transparent",
  border: "1px solid var(--border-hairline-strong)",
  color: "var(--text-primary)",
  cursor: "pointer",
  transition: "background var(--motion-hover)",
};
