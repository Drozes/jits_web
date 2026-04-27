"use client";

import { Sun, Moon, Laptop } from "lucide-react";

interface ThemePickerProps {
  theme: string | undefined;
  onThemeChange: (value: string) => void;
}

const THEMES = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Laptop },
] as const;

export function ThemePicker({ theme, onThemeChange }: ThemePickerProps) {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium">Theme</label>
      <div className="grid grid-cols-3 gap-2">
        {THEMES.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            onClick={() => onThemeChange(value)}
            className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 text-sm transition-colors ${
              theme === value
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:border-primary/50"
            }`}
          >
            <Icon size={18} />
            {label}
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        You can change this later in your profile settings.
      </p>
    </div>
  );
}
