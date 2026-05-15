"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { TOS_TEXT } from "@jits/shared/utils";
import { AppHeader } from "@/components/layout/app-header";
import { Plate } from "@/components/ui/elo-system";
import { Checkbox } from "@/components/ui/checkbox";

interface ParsedBlock {
  type: "title" | "section" | "paragraph";
  label?: string;
  body: string;
}

function parseEuaBody(raw: string): ParsedBlock[] {
  const lines = raw.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const blocks: ParsedBlock[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (i === 0) {
      blocks.push({ type: "title", body: line });
      continue;
    }
    const sectionMatch = /^(\d+\.\s+[^\n]+)/.exec(line);
    if (sectionMatch) {
      const firstLine = sectionMatch[1];
      const rest = line.slice(firstLine.length).trim();
      blocks.push({ type: "section", label: firstLine, body: rest });
    } else {
      blocks.push({ type: "paragraph", body: line });
    }
  }
  return blocks;
}

export function EuaForm() {
  const router = useRouter();
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const blocks = parseEuaBody(TOS_TEXT);

  const handleSubmit = async () => {
    if (!accepted) return;
    setError(null);
    setIsLoading(true);
    const supabase = createClient();

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) throw new Error("Not signed in.");

      const { data: athlete, error: athleteError } = await supabase
        .from("athletes")
        .select("id")
        .eq("auth_user_id", user.id)
        .single();
      if (athleteError || !athlete) {
        throw new Error("Athlete profile not found. Please complete signup first.");
      }

      const { data: waiver, error: waiverError } = await supabase
        .from("waivers")
        .select("id")
        .eq("slug", "app-liability-v1")
        .eq("is_active", true)
        .single();
      if (waiverError || !waiver) {
        throw new Error("Waiver record missing. Contact support.");
      }

      const { error: ackError } = await supabase
        .from("waiver_acknowledgements")
        .insert({ athlete_id: athlete.id, waiver_id: waiver.id });
      if (ackError) throw ackError;

      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record agreement.");
      setIsLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100svh", background: "var(--bg-primary)", display: "flex", flexDirection: "column" }}>
      <AppHeader title="End User Agreement" back />
      <div
        style={{
          flex: 1,
          maxWidth: 560,
          width: "100%",
          margin: "0 auto",
          padding: "var(--space-5)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Plate
          style={{
            flex: 1,
            overflowY: "auto",
            marginBottom: "var(--space-4)",
            fontFamily: "var(--font-body)",
            fontSize: "var(--size-body-s)",
            color: "var(--text-secondary)",
            lineHeight: 1.6,
            maxHeight: "60vh",
          }}
        >
          {blocks.map((block, i) => {
            if (block.type === "title") {
              return (
                <p key={i} style={{ marginTop: 0 }}>
                  <strong
                    style={{
                      color: "var(--text-primary)",
                      textTransform: "uppercase",
                      letterSpacing: "var(--ls-caps)",
                      fontFamily: "var(--font-heading)",
                    }}
                  >
                    {block.body.toUpperCase()}
                  </strong>
                </p>
              );
            }
            if (block.type === "section") {
              return (
                <p key={i}>
                  <strong style={{ color: "var(--text-primary)" }}>{block.label}</strong>
                  {block.body ? ` ${block.body}` : ""}
                </p>
              );
            }
            return <p key={i}>{block.body}</p>;
          })}
        </Plate>

        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-3)",
            marginBottom: "var(--space-4)",
            color: "var(--text-primary)",
            fontFamily: "var(--font-body)",
            fontSize: "var(--size-body-s)",
            cursor: "pointer",
          }}
        >
          <Checkbox
            checked={accepted}
            onCheckedChange={(v: boolean | "indeterminate") => setAccepted(v === true)}
          />
          I agree to the End User Agreement
        </label>

        {error && (
          <p
            style={{
              fontFamily: "var(--font-body)",
              fontSize: "var(--size-body-s)",
              color: "var(--state-negative)",
              margin: "0 0 var(--space-3)",
            }}
          >
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={!accepted || isLoading}
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
            cursor: !accepted || isLoading ? "not-allowed" : "pointer",
            opacity: !accepted || isLoading ? "var(--opacity-disabled)" : 1,
            transition: "background var(--motion-hover)",
          }}
        >
          {isLoading ? "Saving..." : "Create Account"}
        </button>
      </div>
    </div>
  );
}
