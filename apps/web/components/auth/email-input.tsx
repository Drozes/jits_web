"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface EmailInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /**
   * Design-system overrides for surfaces that style fields with brand tokens
   * (the login screen) rather than the default shadcn card chrome
   * (`/forgot-password`). Same escape hatch `CityAutocomplete` uses.
   */
  inputStyle?: React.CSSProperties;
  inputClassName?: string;
  labelStyle?: React.CSSProperties;
}

export function EmailInput({
  value,
  onChange,
  disabled,
  inputStyle,
  inputClassName,
  labelStyle,
}: EmailInputProps) {
  return (
    <div className="grid gap-2">
      <Label htmlFor="email" style={labelStyle}>
        Email
      </Label>
      <Input
        id="email"
        type="email"
        autoComplete="email"
        placeholder="m@example.com"
        required
        disabled={disabled}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={inputStyle}
        className={inputClassName}
      />
    </div>
  );
}
