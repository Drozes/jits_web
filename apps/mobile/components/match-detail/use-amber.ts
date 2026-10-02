import { useResolvedColorScheme } from "@/lib/theme/use-theme";
import { paletteFor } from "@/lib/theme/palette";

/**
 * The `attention` (amber) token for draws, the disputed badge and processing
 * chips. `text` / `border` are the token's Tailwind classes (they follow the
 * theme through the `--attention` CSS var, so they are static strings that
 * NativeWind compiles); `icon` is the active theme's value, for components
 * that take a `color` prop (lucide icons).
 */
export function useAmber(): { text: string; border: string; icon: string } {
  const icon = paletteFor(useResolvedColorScheme()).amber;
  return { text: "text-attention", border: "border-attention", icon };
}
