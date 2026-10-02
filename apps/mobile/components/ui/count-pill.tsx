/**
 * The red count badge (Signal Red fill, mono digits) shared by the header
 * bell and the tab bar, so the cap, type and radius live in one place.
 * Radius `xs` (2px), per the brand radius rule (2 to 4; 8 for sheets only).
 * Static: no animation. The caller positions it via `className`.
 */
import { Text, View } from "react-native";
import { cn } from "@/lib/cn";

import { formatBadgeCount } from "@/lib/navigation/tab-badge";

export { formatBadgeCount };

interface CountPillProps {
  /** What the pill reads: usually `formatBadgeCount(n)`, or a short label. */
  text: string;
  className?: string;
  testID?: string;
}

export function CountPill({ text, className, testID }: CountPillProps) {
  return (
    <View
      testID={testID}
      pointerEvents="none"
      className={cn(
        "absolute min-h-4 min-w-4 items-center justify-center rounded-xs bg-cta px-1",
        className,
      )}
    >
      <Text maxFontSizeMultiplier={1.3} className="font-mono-bold tabular-nums text-[9px] text-ink-on-cta">
        {text}
      </Text>
    </View>
  );
}
