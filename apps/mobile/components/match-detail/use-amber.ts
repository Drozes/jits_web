import { useResolvedColorScheme } from "@/lib/theme/use-theme";

/**
 * Amber for draws, the disputed badge and processing chips. The palette has
 * no warning token and amber-500 is too light on the light surfaces for small
 * text, so light mode steps down to amber-600 (dark keeps amber-500).
 */
export function useAmber(): { text: string; border: string } {
  return useResolvedColorScheme() === "dark"
    ? { text: "text-amber-500", border: "border-amber-500" }
    : { text: "text-amber-600", border: "border-amber-600" };
}
