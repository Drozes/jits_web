"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useState } from "react";
import Link from "next/link";

interface PasswordInputProps {
  id: string;
  label: string;
  autoComplete: string;
  value: string;
  onChange: (value: string) => void;
  showToggle?: boolean;
  forgotPasswordLink?: boolean;
  disabled?: boolean;
  /**
   * Design-system overrides for surfaces that style fields with brand tokens
   * (the login screen) rather than the default shadcn card chrome. Same escape
   * hatch `CityAutocomplete` uses.
   */
  inputStyle?: React.CSSProperties;
  inputClassName?: string;
  labelStyle?: React.CSSProperties;
}

export function PasswordInput({
  id,
  label,
  autoComplete,
  value,
  onChange,
  showToggle,
  forgotPasswordLink,
  disabled,
  inputStyle,
  inputClassName,
  labelStyle,
}: PasswordInputProps) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="grid gap-2">
      <div className="flex items-center">
        <Label htmlFor={id} style={labelStyle}>
          {label}
        </Label>
        {forgotPasswordLink && (
          <Link
            href="/forgot-password"
            className="ml-auto inline-block text-sm underline-offset-4 hover:underline"
          >
            Forgot your password?
          </Link>
        )}
      </div>
      {showToggle ? (
        <div className="relative">
          <Input
            id={id}
            type={showPassword ? "text" : "password"}
            autoComplete={autoComplete}
            required
            disabled={disabled}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            style={inputStyle}
            className={inputClassName ? `${inputClassName} pr-10` : "pr-10"}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            tabIndex={-1}
          >
            {showPassword ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" />
                <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" />
                <path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" />
                <path d="m2 2 20 20" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        </div>
      ) : (
        <Input
          id={id}
          type="password"
          autoComplete={autoComplete}
          required
          disabled={disabled}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={inputStyle}
          className={inputClassName}
        />
      )}
    </div>
  );
}
