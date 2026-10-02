import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";
import { TRACKING_NAMES, TYPE_STEP_NAMES } from "@/lib/typography";

/**
 * tailwind-merge only knows Tailwind's default size and tracking names. Without
 * this, a custom step reads as a text COLOR, so `cn("text-micro", "text-ink")`
 * would drop `text-micro`. Registering the scale (lib/typography.ts) makes a
 * size step and a color coexist, and a later size or tracking step win.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: [...TYPE_STEP_NAMES] }],
      tracking: [{ tracking: [...TRACKING_NAMES] }],
    },
  },
});

/**
 * Conditional className helper for React Native + NativeWind.
 * Mirrors apps/web/lib/utils.ts `cn()` so component code can move between
 * platforms with minimal churn.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
