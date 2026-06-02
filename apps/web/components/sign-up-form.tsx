"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { AppHeader } from "@/components/layout/app-header";
import {
  EMPTY_SIGNUP_VALUES,
  type SignupFormValues,
  validateSignupForm,
} from "@/lib/profile-setup/signup-form-validation";

interface GymOption {
  id: string;
  name: string;
}

interface SignUpFormProps {
  gyms: GymOption[];
  cities: string[];
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

export function SignUpForm({ gyms, cities }: SignUpFormProps) {
  const router = useRouter();
  const [values, setValues] = useState<SignupFormValues>(EMPTY_SIGNUP_VALUES);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const onChange = (patch: Partial<SignupFormValues>) =>
    setValues((v) => ({ ...v, ...patch }));

  const handleContinue = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const result = validateSignupForm(values);
    if (!result.valid) {
      setError(result.error);
      return;
    }

    setIsLoading(true);
    const supabase = createClient();

    try {
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: values.email.trim(),
        password: values.password,
      });
      if (signUpError) throw signUpError;
      if (!signUpData.user) throw new Error("Sign-up failed: no user returned.");

      const firstName = values.firstName.trim();
      const lastName = values.lastName.trim();
      const profilePayload = {
        first_name: firstName,
        last_name: lastName,
        // display_name is a derived label kept in sync for the many views that
        // render it; the backend also auto-derives it from first/last on signup.
        display_name: `${firstName} ${lastName}`.trim(),
        date_of_birth: values.dateOfBirth,
        gender: values.gender,
        current_weight: parseFloat(values.weight),
        city: values.city.trim(),
        primary_gym_id: values.gymId,
        free_agent: false,
      };

      const { error: updateError } = await supabase
        .from("athletes")
        .update(profilePayload)
        .eq("auth_user_id", signUpData.user.id);
      if (updateError) throw updateError;

      router.push("/eua");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setIsLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100svh", background: "var(--bg-primary)" }}>
      <AppHeader title="Create Account" back />
      <form
        onSubmit={handleContinue}
        style={{
          maxWidth: 480,
          margin: "0 auto",
          padding: "var(--space-5)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <SectionHeading label="Account" showSeparator={false} />

        <Field label="Email">
          <input
            type="email"
            autoComplete="email"
            style={FIELD_INPUT_STYLE}
            value={values.email}
            onChange={(e) => onChange({ email: e.target.value })}
          />
        </Field>

        <Field label="Password">
          <input
            type="password"
            autoComplete="new-password"
            style={FIELD_INPUT_STYLE}
            value={values.password}
            onChange={(e) => onChange({ password: e.target.value })}
          />
        </Field>

        <SectionHeading label="Profile" showSeparator />

        <Field label="First Name">
          <input
            type="text"
            autoComplete="given-name"
            style={{ ...FIELD_INPUT_STYLE, fontFamily: "var(--font-body)" }}
            value={values.firstName}
            onChange={(e) => onChange({ firstName: e.target.value })}
          />
        </Field>

        <Field label="Last Name">
          <input
            type="text"
            autoComplete="family-name"
            style={{ ...FIELD_INPUT_STYLE, fontFamily: "var(--font-body)" }}
            value={values.lastName}
            onChange={(e) => onChange({ lastName: e.target.value })}
          />
        </Field>

        <Field label="Date of Birth">
          <input
            type="date"
            style={FIELD_INPUT_STYLE}
            value={values.dateOfBirth}
            onChange={(e) => onChange({ dateOfBirth: e.target.value })}
          />
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
                checked={values.gender === "M"}
                onChange={() => onChange({ gender: "M" })}
              />
              Male
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", cursor: "pointer" }}>
              <input
                type="radio"
                name="gender"
                value="F"
                checked={values.gender === "F"}
                onChange={() => onChange({ gender: "F" })}
              />
              Female
            </label>
          </div>
        </Field>

        <Field label="Weight">
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "var(--space-2)",
              width: "100%",
            }}
          >
            <input
              type="number"
              inputMode="decimal"
              min={50}
              max={400}
              step={0.1}
              style={{ ...FIELD_INPUT_STYLE, flex: 1 }}
              value={values.weight}
              onChange={(e) => onChange({ weight: e.target.value })}
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
              LBS
            </span>
          </div>
        </Field>

        <Field label="City">
          <select
            style={FIELD_INPUT_STYLE}
            value={values.city}
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
            value={values.gymId}
            onChange={(e) => onChange({ gymId: e.target.value })}
          >
            <option value="">Select a gym</option>
            {gyms.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </Field>

        {error && (
          <p
            style={{
              fontFamily: "var(--font-body)",
              fontSize: "var(--size-body-s)",
              color: "var(--state-negative)",
              margin: "var(--space-2) 0",
            }}
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={isLoading}
          className="font-heading font-bold uppercase"
          style={{
            marginTop: "var(--space-4)",
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
            cursor: isLoading ? "not-allowed" : "pointer",
            opacity: isLoading ? "var(--opacity-disabled)" : 1,
            transition: "background var(--motion-hover)",
          }}
        >
          {isLoading ? "Creating account..." : "Continue"}
        </button>
      </form>
    </div>
  );
}

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

function SectionHeading({
  label,
  showSeparator,
}: {
  label: string;
  showSeparator: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        marginTop: showSeparator ? "var(--space-4)" : 0,
      }}
    >
      {showSeparator && (
        <div
          style={{
            height: "1px",
            width: "100%",
            background: "var(--border-hairline)",
            marginBottom: "var(--space-4)",
          }}
        />
      )}
      <div
        className="font-heading font-bold uppercase"
        style={{
          fontSize: "var(--size-label-l)",
          letterSpacing: "var(--ls-caps-l)",
          color: "var(--text-tertiary)",
          marginBottom: "var(--space-2)",
        }}
      >
        {label}
      </div>
    </div>
  );
}
