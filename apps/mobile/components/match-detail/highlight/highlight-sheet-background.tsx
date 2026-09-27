import * as React from "react";
import { View } from "react-native";
import type { BottomSheetBackgroundProps } from "@gorhom/bottom-sheet";

/** Purely visual: no gorhom "Bottom Sheet" a11y stop, 8 px modal radius cap. */
export function SheetBackground({ style, pointerEvents }: BottomSheetBackgroundProps) {
  return (
    <View
      pointerEvents={pointerEvents}
      accessible={false}
      importantForAccessibility="no"
      style={[style, { borderTopLeftRadius: 8, borderTopRightRadius: 8 }]}
    />
  );
}
