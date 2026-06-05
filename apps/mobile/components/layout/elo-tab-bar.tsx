import { View, Text, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { cn } from "@/lib/cn";

/**
 * Custom bottom tab bar mirroring apps/web/components/layout/bottom-nav-bar.tsx.
 * 4-up grid, 2px CTA top border on active, mono-caps labels, hairline top border.
 */
export function EloTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const tokens = useThemedTokens();

  return (
    <View
      className="bg-surface-2 border-t border-hairline flex-row"
      style={{ paddingBottom: insets.bottom }}
    >
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        // A route opts out of the bar by setting `tabBarButton` to a renderer
        // that returns null (Expo Router's idiom for a hidden-but-mounted tab).
        // The gym-manager tab uses this to stay hidden for non-managers.
        if (options.tabBarButton?.({} as never) === null) return null;
        const isActive = state.index === index;
        const label =
          typeof options.tabBarLabel === "string"
            ? options.tabBarLabel
            : options.title ?? route.name;

        const onPress = () => {
          const event = navigation.emit({
            type: "tabPress",
            target: route.key,
            canPreventDefault: true,
          });
          if (!isActive && !event.defaultPrevented) {
            // React Navigation's typed navigate doesn't model dynamic route
            // names well from a custom tab bar; cast to any for this call.
            (navigation as any).navigate(route.name, route.params);
          }
        };

        const onLongPress = () => {
          navigation.emit({ type: "tabLongPress", target: route.key });
        };

        const iconNode = options.tabBarIcon?.({
          focused: isActive,
          color: isActive ? tokens.textPrimary : tokens.textTertiary,
          size: 18,
        });

        return (
          <Pressable
            key={route.key}
            accessibilityRole="button"
            accessibilityState={isActive ? { selected: true } : {}}
            accessibilityLabel={
              typeof options.tabBarAccessibilityLabel === "string"
                ? options.tabBarAccessibilityLabel
                : label
            }
            onPress={onPress}
            onLongPress={onLongPress}
            className={cn(
              "flex-1 items-center justify-center gap-1 py-3 border-t-[2px] active:bg-surface-3",
              isActive ? "border-cta" : "border-transparent",
            )}
          >
            <View pointerEvents="none">{iconNode}</View>
            <Text
              className={cn(
                "font-heading text-[10px] uppercase tracking-caps-l",
                isActive ? "text-ink" : "text-ink-3",
              )}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
