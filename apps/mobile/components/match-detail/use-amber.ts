import { useResolvedColorScheme } from "@/lib/theme/use-theme";

/**
 * Amber for draws, the disputed badge and processing chips. The palette has
 * no warning token and amber-500 is too light on the light surfaces for small
 * text, so light mode steps down to amber-600 (dark keeps amber-500).
 * `icon` is the same shade as a hex, for components that take a `color`
 * prop instead of a className (lucide icons).
 */
export function useAmber(): { text: string; border: string; icon: string } {
  return useResolvedColorScheme() === "dark"
    ? { text: "text-amber-500", border: "border-amber-500", icon: "#F59E0B" }
    : { text: "text-amber-600", border: "border-amber-600", icon: "#D97706" };
}
