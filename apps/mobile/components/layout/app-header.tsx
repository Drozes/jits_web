import * as React from "react";
import { View, Text, Pressable } from "react-native";
import { ChevronLeft } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { cn } from "@/lib/cn";

interface AppHeaderProps {
  title?: string;
  back?: boolean;
  icon?: React.ReactNode;
  rightAction?: React.ReactNode;
  className?: string;
}

/**
 * Mobile equivalent of apps/web/components/layout/app-header.tsx.
 * 56pt tall, [back | title | right] grid, font-heading caps title.
 */
export function AppHeader({
  title,
  back = false,
  icon,
  rightAction,
  className,
}: AppHeaderProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const tokens = useThemedTokens();

  return (
    <View
      className={cn(
        "bg-surface-2 border-b border-hairline flex-row items-center px-4",
        className,
      )}
      style={{ paddingTop: insets.top, height: 56 + insets.top }}
    >
      <View style={{ width: 32, height: 32 }}>
        {back ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go back"
            onPress={() => router.back()}
            hitSlop={10}
            className="w-8 h-8 items-center justify-center rounded-xs active:bg-surface-3"
          >
            <ChevronLeft size={20} color={tokens.textSecondary} />
          </Pressable>
        ) : null}
      </View>

      <View className="flex-1 flex-row items-center justify-center gap-2">
        {icon ? <View>{icon}</View> : null}
        {title ? (
          <Text
            numberOfLines={1}
            className="font-heading text-[12px] text-ink-2 uppercase tracking-caps-l"
          >
            {title}
          </Text>
        ) : null}
      </View>

      <View
        className="flex-row items-center justify-end"
        style={{ minWidth: 32, height: 32 }}
      >
        {rightAction}
      </View>
    </View>
  );
}
