"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface EditProfileFormProps {
  athleteId: string;
  firstName: string;
  lastName: string;
  weightKg: number | null;
  city: string | null;
  primaryGymId: string | null;
  gyms: { id: string; name: string }[];
}

export function EditProfileForm({
  athleteId,
  firstName: initialFirst,
  lastName: initialLast,
  weightKg,
  city,
  primaryGymId,
  gyms,
}: EditProfileFormProps) {
  const router = useRouter();
  const [first, setFirst] = useState(initialFirst);
  const [last, setLast] = useState(initialLast);
  const [weight, setWeight] = useState(weightKg?.toString() ?? "");
  const [cityValue, setCityValue] = useState(city ?? "");
  const [gymId, setGymId] = useState(primaryGymId ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const supabase = createClient();
    const display = `${first.trim()} ${last.trim()}`.trim();
    const weightNum = weight.trim() ? parseFloat(weight) : null;
    if (weightNum !== null && (isNaN(weightNum) || weightNum <= 0 || weightNum > 250)) {
      setError("Invalid weight");
      setSaving(false);
      return;
    }

    const { error: dbError } = await supabase
      .from("athletes")
      .update({
        first_name: first.trim(),
        last_name: last.trim(),
        display_name: display || initialFirst,
        current_weight: weightNum,
        city: cityValue.trim() || null,
        primary_gym_id: gymId || null,
      })
      .eq("id", athleteId);

    setSaving(false);
    if (dbError) {
      setError(dbError.message);
      return;
    }
    router.push("/profile");
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSave}
      className="mx-auto w-full max-w-md px-4 pt-4 pb-[calc(6rem+env(safe-area-inset-bottom))]"
      style={{ background: "var(--bg-primary)" }}
    >
      <Field label="First Name">
        <FieldInput value={first} onChange={setFirst} />
      </Field>
      <Field label="Last Name">
        <FieldInput value={last} onChange={setLast} />
      </Field>
      <Field label="Weight (kg)">
        <FieldInput
          value={weight}
          onChange={setWeight}
          type="number"
          step="0.1"
          min="0"
          max="250"
        />
      </Field>
      <Field label="City">
        <FieldInput value={cityValue} onChange={setCityValue} />
      </Field>
      <Field label="Home Gym">
        <select
          value={gymId}
          onChange={(e) => setGymId(e.target.value)}
          className="font-body"
          style={fieldStyle}
        >
          <option value="">Free agent</option>
          {gyms.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </Field>
      {error && (
        <p
          className="font-mono uppercase"
          style={{
            fontSize: "var(--size-num-xs)",
            color: "var(--state-negative)",
            letterSpacing: "var(--ls-caps-l)",
            marginBottom: "var(--space-3)",
          }}
        >
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={saving}
        className="font-heading uppercase"
        style={{
          fontFamily: "var(--font-heading)",
          fontWeight: 700,
          fontSize: "var(--size-label-l)",
          letterSpacing: "var(--ls-caps)",
          padding: "var(--space-4) var(--space-5)",
          background: "var(--accent-cta)",
          color: "var(--text-on-accent)",
          border: "1px solid transparent",
          borderRadius: "var(--radius-sm)",
          cursor: saving ? "not-allowed" : "pointer",
          width: "100%",
          marginTop: "var(--space-4)",
          opacity: saving ? 0.6 : 1,
        }}
      >
        {saving ? "Saving…" : "Save Changes"}
      </button>
    </form>
  );
}

const fieldStyle: React.CSSProperties = {
  background: "var(--bg-elevated)",
  border: "1px solid var(--border-hairline-strong)",
  borderRadius: "var(--radius-xs)",
  padding: "var(--space-3) var(--space-4)",
  color: "var(--text-primary)",
  fontFamily: "var(--font-body)",
  fontSize: "var(--size-body)",
  width: "100%",
  transition: "border-color var(--motion-hover)",
};

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-2)",
        marginBottom: "var(--space-4)",
      }}
    >
      <label
        className="font-heading uppercase"
        style={{
          fontFamily: "var(--font-heading)",
          fontSize: "var(--size-label-s)",
          letterSpacing: "var(--ls-caps-xl)",
          color: "var(--text-tertiary)",
          fontWeight: 700,
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function FieldInput({
  value,
  onChange,
  type = "text",
  step,
  min,
  max,
}: {
  value: string;
  onChange: (v: string) => void;
  type?: string;
  step?: string;
  min?: string;
  max?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      step={step}
      min={min}
      max={max}
      style={fieldStyle}
    />
  );
}
