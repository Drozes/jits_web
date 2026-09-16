"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Chip } from "@/components/ui/elo-system";

const OPTIONS = [
  { value: "dark", label: "DARK" },
  { value: "light", label: "LIGHT" },
  { value: "system", label: "AUTO" },
] as const;

/**
 * Theme picker, shared by Settings and Profile.
 *
 * Drives BOTH token systems at once: the ThemeProvider in app/layout.tsx emits
 * `class` (shadcn slots in globals.css) and `data-theme` (brand tokens in
 * design-system/tokens.css). Changing one without the other is what produced
 * unreadable text on the dark shell.
 */
export function ThemeChips() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Default to "system" pre-mount rather than undefined so a chip is always
  // selected; the real value swaps in on mount without a hydration mismatch.
  const active = mounted ? theme ?? resolvedTheme ?? "system" : "system";

  return (
    <div
      role="group"
      aria-label="Theme"
      style={{ display: "inline-flex", gap: "var(--space-1)" }}
    >
      {OPTIONS.map(({ value, label }) => (
        <Chip
          key={value}
          active={active === value}
          aria-pressed={active === value}
          onClick={() => setTheme(value)}
          style={{ minHeight: 44 }}
        >
          {label}
        </Chip>
      ))}
    </div>
  );
}
