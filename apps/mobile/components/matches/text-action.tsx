import * as React from "react";
import { Pressable, Text } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { usePalette } from "@/lib/theme/palette";
import { TRACKING, typeStep } from "@/lib/typography";

interface TextActionProps {
  label: string;
  onPress: () => void;
  accessibilityLabel?: string;
  testID?: string;
  /** Drawn left of the label in ink (e.g. UserPlus for Challenge a friend). */
  icon?: (color: string) => React.ReactNode;
  /** A trailing chevron (Find a match). */
  chevron?: boolean;
}

/**
 * A secondary text action for the Matches empty and low-data states: caps
 * DM Sans in ink, a 44 pt target, never red (the screen's one red CTA is
 * Find a match in the Arena).
 */
export function TextAction({ label, onPress, accessibilityLabel, testID, icon, chevron = false }: TextActionProps) {
  const p = usePalette();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      className="flex-row items-center self-center active:opacity-70"
      style={{ minHeight: 44, gap: 6, paddingHorizontal: 8 }}
    >
      {icon ? icon(p.text) : null}
      <Text className="font-heading uppercase" style={[typeStep("small"), { letterSpacing: TRACKING.caps, color: p.text }]}>
        {label}
      </Text>
      {chevron ? <ChevronRight size={14} color={p.text} /> : null}
    </Pressable>
  );
}
