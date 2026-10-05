import * as React from "react";
import { View } from "react-native";
import { useSegments } from "expo-router";
import { SafeAreaInsetsContext } from "react-native-safe-area-context";
import { useUploadStripModel } from "@/lib/video/use-upload-strip";
import { UploadStrip } from "./upload-strip";

/** The strip on the tab bar, above it (the screens shrink to make room). */
export function TabsUploadStrip() {
  const model = useUploadStripModel();
  return model ? <UploadStrip model={model} /> : null;
}

/**
 * Wraps the `(app)` Stack: while a pushed screen is on top and a job is
 * showing, the strip sits under the Stack with the bottom safe area, and the
 * screens inside see a bottom inset of 0 so the safe area is padded once,
 * by the strip (no double gap). On the tabs the bar's copy shows instead.
 * The Provider is always rendered (when there is a safe-area context), so
 * the strip appearing never remounts the Stack.
 */
export function StackStripFrame({ children }: { children: React.ReactNode }) {
  const model = useUploadStripModel();
  const segments = useSegments() as string[];
  const insets = React.useContext(SafeAreaInsetsContext);
  const onTabs = segments[0] !== "(app)" || segments.length < 2 || segments[1] === "(tabs)";
  const show = model != null && !onTabs;
  const inner = React.useMemo(() => (insets && show ? { ...insets, bottom: 0 } : insets), [insets, show]);
  return (
    <View style={{ flex: 1 }}>
      {inner ? <SafeAreaInsetsContext.Provider value={inner}>{children}</SafeAreaInsetsContext.Provider> : children}
      {show && model ? <UploadStrip model={model} bottomInset={insets?.bottom ?? 0} /> : null}
    </View>
  );
}
