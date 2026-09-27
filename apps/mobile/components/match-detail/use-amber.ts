import { useResolvedColorScheme } from "@/lib/theme/use-theme";
import { paletteFor } from "@/lib/theme/palette";

/**
 * Amber for draws, the disputed badge and processing chips: the palette's
 * amber (`paletteFor(scheme).amber`), so the whole app has one per theme.
 * The palette has no warning token; amber-500 reads on the dark surfaces,
 * and on the light ones only amber-800 reaches 4.5:1 for small text.
 * `text` / `border` are the matching Tailwind classes (static, so NativeWind
 * compiles them); `icon` is the hex, for components that take a `color`
 * prop (lucide icons).
 */
export function useAmber(): { text: string; border: string; icon: string } {
  const scheme = useResolvedColorScheme();
  const icon = paletteFor(scheme).amber;
  return scheme === "dark"
    ? { text: "text-amber-500", border: "border-amber-500", icon }
    : { text: "text-amber-800", border: "border-amber-800", icon };
}
