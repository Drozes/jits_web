import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Conditional className helper for React Native + NativeWind.
 * Mirrors apps/web/lib/utils.ts `cn()` so component code can move between
 * platforms with minimal churn.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
