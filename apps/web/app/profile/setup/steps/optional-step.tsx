"use client";

import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemePicker } from "../theme-picker";
import type { WizardValues } from "../setup-wizard";

interface OptionalStepProps {
  values: WizardValues;
  onChange: (patch: Partial<WizardValues>) => void;
  onSubmit: (skipOptional: boolean) => void;
  loading: boolean;
  isEditing: boolean;
}

export function OptionalStep({
  values,
  onChange,
  onSubmit,
  loading,
  isEditing,
}: OptionalStepProps) {
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="city">City</Label>
        <Input
          id="city"
          placeholder="e.g. Austin, TX"
          value={values.city}
          onChange={(e) => onChange({ city: e.target.value })}
          maxLength={100}
        />
        <p className="text-xs text-muted-foreground">
          Helps you find local sessions and gyms.
        </p>
      </div>

      <ThemePicker theme={theme} onThemeChange={setTheme} />

      <Button type="button" onClick={() => onSubmit(false)} disabled={loading}>
        {loading ? "Saving..." : isEditing ? "Save Changes" : "Get Started"}
      </Button>
      <Button
        type="button"
        variant="ghost"
        onClick={() => onSubmit(true)}
        disabled={loading}
      >
        Skip for now
      </Button>
    </div>
  );
}
