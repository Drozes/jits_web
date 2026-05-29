import * as React from "react";
import { ScrollView, View, type ScrollViewProps } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { cn } from "@/lib/cn";

interface PageContainerProps extends ScrollViewProps {
  className?: string;
  /** When true, do not add bottom padding for the tab bar (e.g. on tabless screens). */
  noTabBar?: boolean;
  children: React.ReactNode;
}

/**
 * Mobile scroll container. Mirrors apps/web/components/layout/page-container.tsx:
 * page-tinted background, 16px horizontal padding, bottom inset clearing the
 * 56pt tab bar plus the device's safe-area inset.
 */
export function PageContainer({
  className,
  contentContainerStyle,
  noTabBar = false,
  children,
  ...rest
}: PageContainerProps) {
  const insets = useSafeAreaInsets();
  const bottomPad = (noTabBar ? 16 : 96) + insets.bottom;

  return (
    <ScrollView
      className={cn("flex-1 bg-surface", className)}
      contentContainerStyle={[
        { paddingHorizontal: 16, paddingBottom: bottomPad },
        contentContainerStyle,
      ]}
      {...rest}
    >
      {children}
    </ScrollView>
  );
}

/**
 * Non-scrolling page surface for screens that manage their own scroll.
 */
export function PageSurface({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <View className={cn("flex-1 bg-surface", className)}>{children}</View>;
}
