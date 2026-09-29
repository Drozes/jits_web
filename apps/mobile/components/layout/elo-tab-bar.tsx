import { View, Text, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { cn } from "@/lib/cn";
import { CountPill, formatBadgeCount } from "@/components/ui/count-pill";
import type { TabBadge } from "@/lib/navigation/tab-badge";

/** The mark's rules live with the type in `lib/navigation/tab-badge.ts`. */
export type { TabBadge };

/** Badges by route name (for example `arena`), supplied by the tabs layout. */
export type TabBadges = Partial<Record<string, TabBadge | null>>;

/**
 * The badge a tab shows: the layout's `badges[route]` first, else React
 * Navigation's own `tabBarBadge` option read as a count (a number, or a
 * numeric string; any other string is no badge). Null when there is nothing
 * to show.
 */
export function resolveTabBadge(
  explicit: TabBadge | null | undefined,
  tabBarBadge: string | number | undefined,
): TabBadge | null {
  if (explicit) {
    if (explicit.kind !== "count") return explicit;
    return normalizeCount(explicit.count, explicit.label);
  }
  if (tabBarBadge === undefined || tabBarBadge === "") return null;
  const n = typeof tabBarBadge === "number" ? tabBarBadge : Number(tabBarBadge);
  return normalizeCount(n);
}

/**
 * One rule for both sources: a positive count is floored to a whole number;
 * anything else (zero, negative, non-finite) is no badge, whatever the label.
 */
function normalizeCount(count: number, label?: string): TabBadge | null {
  const whole = Number.isFinite(count) ? Math.floor(count) : 0;
  if (whole <= 0) return null;
  return label ? { kind: "count", count: whole, label } : { kind: "count", count: whole };
}

/**
 * What VoiceOver reads for a badge. A positive count always reads its number,
 * so sighted and VoiceOver users get the same information: a label that
 * already states the number ("2 challenges") is read as-is, any other label
 * follows the number ("3 NEW"), and no label reads "N new".
 */
function badgeText(badge: TabBadge): string {
  if (badge.kind !== "count") return badge.label;
  if (!badge.label) return `${badge.count} new`;
  return new RegExp(`(^|\\D)${badge.count}(\\D|$)`).test(badge.label)
    ? badge.label
    : `${badge.count} ${badge.label}`;
}

function TabBadgeMark({ badge, routeName }: { badge: TabBadge; routeName: string }) {
  if (badge.kind === "dot") {
    return (
      <View
        testID={`tab-badge-dot-${routeName}`}
        className="absolute -top-0.5 -right-1.5 w-2 h-2 rounded-full bg-positive"
      />
    );
  }
  if (badge.kind === "ring") {
    return (
      <View
        testID={`tab-badge-ring-${routeName}`}
        className="absolute -top-0.5 -right-1.5 w-2 h-2 rounded-full border-[1.5px] border-ink-3"
      />
    );
  }
  // `resolveTabBadge` only yields positive counts.
  return (
    <CountPill
      testID={`tab-badge-count-${routeName}`}
      className="-top-1.5 -right-2.5"
      text={formatBadgeCount(badge.count)}
    />
  );
}

interface EloTabBarProps extends BottomTabBarProps {
  /** Status marks by route name. See `TabBadge`. */
  badges?: TabBadges;
}

/**
 * Custom bottom tab bar mirroring apps/web/components/layout/bottom-nav-bar.tsx.
 *
 * Equal-width columns, one per tab registered in `(tabs)/_layout.tsx`: Home,
 * Arena, Rankings, Profile once Arena lands, three until then. Each column is
 * `flex-1`, so the row divides evenly at whatever count is registered and no
 * item is squeezed. 2px CTA top border on active, mono-caps labels, hairline
 * top border, bottom safe-area inset applied to the container. A tab can
 * carry a static badge (red count, green dot, hollow ring) on its icon; see
 * `TabBadge`.
 */
export function EloTabBar({ state, descriptors, navigation, badges }: EloTabBarProps) {
  const insets = useSafeAreaInsets();
  const tokens = useThemedTokens();

  return (
    <View
      className="bg-surface-2 border-t border-hairline flex-row"
      style={{ paddingBottom: insets.bottom }}
    >
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        // Opt-out contract: Expo Router compiles `options={{ href: null }}` on a
        // Tabs.Screen down to `tabBarButton: () => null`, so honoring that here
        // is what makes the documented "mounted but not in the bar" escape hatch
        // work with this custom bar. No tab uses it today (routes that must not
        // be tabs live outside the `(tabs)` group instead), but the branch is
        // the contract with Expo Router, not a leftover, and is covered by
        // __tests__/components/layout/elo-tab-bar.test.tsx.
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

        const badge = resolveTabBadge(badges?.[route.name], options.tabBarBadge);

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
            accessibilityValue={badge ? { text: badgeText(badge) } : undefined}
            onPress={onPress}
            onLongPress={onLongPress}
            className={cn(
              "flex-1 items-center justify-center gap-1 py-3 border-t-[2px] active:bg-surface-3",
              isActive ? "border-cta" : "border-transparent",
            )}
          >
            <View pointerEvents="none" className="relative">
              {iconNode}
              {badge ? <TabBadgeMark badge={badge} routeName={route.name} /> : null}
            </View>
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
