import * as React from "react";
import { View, Text, Pressable } from "react-native";
import { ChevronLeft } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, type Href } from "expo-router";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { cn } from "@/lib/cn";
import { HeaderLiveDot } from "./header-live-dot";

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
  className?: string;
}

/**
 * Mobile equivalent of apps/web/components/layout/app-header.tsx, for PUSHED
 * screens (match, practice, settings, athlete, stats) and the auth screens.
 * 56pt tall, [back | title | live dot + right] grid, font-heading caps title.
 * The five tab roots use `BrandHeader` instead (wordmark and rating), which carry the
 * interactive status chip.
 *
 * While live, the right slot shows a small NON-interactive live dot (decision
 * Q1, `HeaderLiveDot`); nothing to tap, so a pushed screen never offers a
 * shortcut out of a match or a settings flow.
 *
 * The two side slots share the leftover width equally (flex 1, basis 0), so
 * the title stays optically centred whatever sits on the right, and the live
 * dot appearing or disappearing never moves it. The title is capped at half
 * the bar, which leaves each side at least a quarter (about 86pt on a 375pt
 * iPhone SE): room for the dot plus one 32pt action.
 */
export function AppHeader({
  title,
  back = false,
  backFallback,
  icon,
  rightAction,
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
        "bg-surface-2 border-b border-hairline flex-row items-center",
        className,
      )}
      style={{
        paddingTop: insets.top,
        height: 56 + insets.top,
        // 16 in portrait; clears the notch and corners on the landscape ready check.
        paddingLeft: Math.max(16, insets.left),
        paddingRight: Math.max(16, insets.right),
      }}
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
            className="font-heading text-small text-ink-2 uppercase tracking-caps-l"
          >
            {title}
          </Text>
        ) : null}
      </View>

      <View
        className="flex-row items-center justify-end gap-2"
        style={{ flex: 1, flexBasis: 0, height: 32 }}
      >
        <HeaderLiveDot />
        {rightAction}
      </View>
    </View>
  );
}
