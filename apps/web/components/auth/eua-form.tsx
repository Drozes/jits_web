"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { TOS_TEXT } from "@jits/shared/utils";
import {
  isAtLeast16,
  isWeightKgValid,
} from "@/lib/profile-setup/signup-form-validation";
import { AppHeader } from "@/components/layout/app-header";
import { Plate } from "@/components/ui/elo-system";
import { Checkbox } from "@/components/ui/checkbox";

interface ParsedBlock {
  type: "title" | "section" | "paragraph";
  label?: string;
  body: string;
}

interface ProfileValues {
  weightKg: string;
  gender: "M" | "F" | "";
  dateOfBirth: string;
  city: string;
  gymId: string;
  freeAgent: boolean;
}

interface EuaFormProps {
  needsProfile: boolean;
  gyms: { id: string; name: string }[];
  cities: string[];
  initialProfile: ProfileValues;
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

function validateProfile(v: ProfileValues): string | null {
  if (!isWeightKgValid(v.weightKg)) {
    return "Enter a valid weight in kilograms (20-300).";
  }
  if (v.gender !== "M" && v.gender !== "F") {
    return "Select a gender.";
  }
  if (!v.dateOfBirth || !isAtLeast16(v.dateOfBirth)) {
    return "You must be at least 16 years old.";
  }
  if (!v.city.trim()) {
    return "Select a city.";
  }
  return null;
}

export function EuaForm({
  needsProfile,
  gyms,
  cities,
  initialProfile,
}: EuaFormProps) {
  const router = useRouter();
  const [accepted, setAccepted] = useState(false);
  const [profile, setProfile] = useState<ProfileValues>(initialProfile);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const blocks = parseEuaBody(TOS_TEXT);

  const onChange = (patch: Partial<ProfileValues>) =>
    setProfile((p) => ({ ...p, ...patch }));

  const handleSubmit = async () => {
    if (!accepted) return;
    setError(null);

    if (needsProfile) {
      const msg = validateProfile(profile);
      if (msg) {
        setError(msg);
        return;
      }
    }

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

      // Fill the profile fields. The backend `handle_athlete_activation`
      // trigger flips status pending -> active off this update once weight +
      // (gym OR free_agent) are present, so we never write `status` directly
      // (the `guard_athlete_columns` trigger would silently revert it).
      if (needsProfile) {
        const gymId = profile.gymId.trim();
        const { error: updateError } = await supabase
          .from("athletes")
          .update({
            current_weight: parseFloat(profile.weightKg),
            gender: profile.gender,
            date_of_birth: profile.dateOfBirth,
            city: profile.city.trim(),
            primary_gym_id: gymId || null,
            free_agent: !gymId,
          })
          .eq("id", athlete.id);
        if (updateError) throw updateError;
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

      // Idempotent: the app waiver has a null session_id, so the unique
      // constraint won't catch repeat inserts. Check before inserting.
      const { data: existingAck } = await supabase
        .from("waiver_acknowledgements")
        .select("id")
        .eq("athlete_id", athlete.id)
        .eq("waiver_id", waiver.id)
        .is("session_id", null)
        .maybeSingle();
      if (!existingAck) {
        const { error: ackError } = await supabase
          .from("waiver_acknowledgements")
          .insert({ athlete_id: athlete.id, waiver_id: waiver.id });
        if (ackError) throw ackError;
      }

      router.push("/");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to record agreement.");
      setIsLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100svh", background: "var(--bg-primary)", display: "flex", flexDirection: "column" }}>
      <AppHeader title={needsProfile ? "Finish Setup" : "End User Agreement"} back />
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
        {needsProfile && (
          <div style={{ marginBottom: "var(--space-4)" }}>
            <SectionHeading label="Your Details" />

            <Field label="Weight">
              <div style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-2)", width: "100%" }}>
                <input
                  type="number"
                  inputMode="decimal"
                  min={20}
                  max={300}
                  step={0.1}
                  style={{ ...FIELD_INPUT_STYLE, flex: 1 }}
                  value={profile.weightKg}
                  onChange={(e) => onChange({ weightKg: e.target.value })}
                />
                <span
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "var(--size-label-s)",
                    textTransform: "uppercase",
                    letterSpacing: "var(--ls-caps-l)",
                    color: "var(--text-tertiary)",
                    fontWeight: 700,
                  }}
                >
                  KG
                </span>
              </div>
            </Field>

            <Field label="Gender">
              <div
                style={{
                  display: "flex",
                  gap: "var(--space-4)",
                  marginTop: "var(--space-1)",
                  color: "var(--text-primary)",
                  fontFamily: "var(--font-body)",
                }}
              >
                <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", cursor: "pointer" }}>
                  <input
                    type="radio"
                    name="gender"
                    value="M"
                    checked={profile.gender === "M"}
                    onChange={() => onChange({ gender: "M" })}
                  />
                  Male
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", cursor: "pointer" }}>
                  <input
                    type="radio"
                    name="gender"
                    value="F"
                    checked={profile.gender === "F"}
                    onChange={() => onChange({ gender: "F" })}
                  />
                  Female
                </label>
              </div>
            </Field>

            <Field label="Date of Birth">
              <input
                type="date"
                style={FIELD_INPUT_STYLE}
                value={profile.dateOfBirth}
                onChange={(e) => onChange({ dateOfBirth: e.target.value })}
              />
            </Field>

            <Field label="City">
              <select
                style={FIELD_INPUT_STYLE}
                value={profile.city}
                onChange={(e) => onChange({ city: e.target.value })}
              >
                <option value="">Select a city</option>
                {cities.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Home Gym">
              <select
                style={FIELD_INPUT_STYLE}
                value={profile.gymId}
                onChange={(e) => onChange({ gymId: e.target.value })}
              >
                <option value="">Free agent (no gym)</option>
                {gyms.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}

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
          {isLoading ? "Saving..." : needsProfile ? "Create Account" : "Agree & Continue"}
        </button>
      </div>
    </div>
  );
}

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
  outline: "none",
  transition: "border-color var(--motion-hover)",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-2)",
        marginBottom: "var(--space-4)",
      }}
    >
      <label style={FIELD_LABEL_STYLE}>{label}</label>
      {children}
    </div>
  );
}

function SectionHeading({ label }: { label: string }) {
  return (
    <div
      className="font-heading font-bold uppercase"
      style={{
        fontSize: "var(--size-label-l)",
        letterSpacing: "var(--ls-caps-l)",
        color: "var(--text-tertiary)",
        marginBottom: "var(--space-3)",
      }}
    >
      {label}
    </div>
  );
}
