import * as React from "react";
import { View, Text, Pressable } from "react-native";
import { ChevronLeft } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, type Href } from "expo-router";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { cn } from "@/lib/cn";
import { LiveHeaderSignal } from "./live-header-signal";

interface AppHeaderProps {
  title?: string;
  back?: boolean;
  /**
   * Where the back chevron goes when there is no history to pop (i.e. the screen
   * was the entry route via deep link or reload). Stack `initialRouteName`
   * anchors handle the common case; this is the explicit safety net so the
   * chevron can never become a dead, no-op button.
   */
  backFallback?: Href;
  icon?: React.ReactNode;
  rightAction?: React.ReactNode;
  /**
   * How the LIVE pill behaves (it only renders while the athlete is live).
   * "link" taps through to the Arena; the Arena itself passes "static".
   */
  liveSignal?: "link" | "static";
  className?: string;
}

/**
 * Mobile equivalent of apps/web/components/layout/app-header.tsx.
 * 56pt tall, [back | title | live pill + right] grid, font-heading caps title.
 *
 * The two side slots share the leftover width equally (flex 1, basis 0), so
 * the title stays optically centred whatever sits on the right, and the LIVE
 * pill appearing or disappearing never moves it. The title is capped at half
 * the bar, which leaves each side at least a quarter (about 86pt on a 375pt
 * iPhone SE): room for the pill plus one 32pt action.
 */
export function AppHeader({
  title,
  back = false,
  backFallback,
  icon,
  rightAction,
  liveSignal = "link",
  className,
}: AppHeaderProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const tokens = useThemedTokens();

  const handleBack = React.useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else if (backFallback) {
      router.replace(backFallback);
    }
  }, [router, backFallback]);

  return (
    <View
      className={cn(
        "bg-surface-2 border-b border-hairline flex-row items-center px-4",
        className,
      )}
      style={{ paddingTop: insets.top, height: 56 + insets.top }}
    >
      <View style={{ flex: 1, flexBasis: 0, height: 32 }}>
        {back ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={handleBack}
            hitSlop={10}
            className="w-8 h-8 items-center justify-center rounded-xs active:bg-surface-3"
          >
            <View pointerEvents="none">
              <ChevronLeft size={20} color={tokens.textSecondary} />
            </View>
          </Pressable>
        ) : null}
      </View>

      <View
        className="flex-row items-center justify-center gap-2"
        style={{ maxWidth: "50%", flexShrink: 1 }}
      >
        {icon ? <View>{icon}</View> : null}
        {title ? (
          <Text
            numberOfLines={1}
            style={{ flexShrink: 1 }}
            className="font-heading text-[12px] text-ink-2 uppercase tracking-caps-l"
          >
            {title}
          </Text>
        ) : null}
      </View>

      <View
        className="flex-row items-center justify-end gap-2"
        style={{ flex: 1, flexBasis: 0, height: 32 }}
      >
        <LiveHeaderSignal variant={liveSignal} />
        {rightAction}
      </View>
    </View>
  );
}
