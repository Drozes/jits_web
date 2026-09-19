/**
 * The one Signal Red CTA on the Arena surface.
 *
 * A button, not a Switch: the brand system allows exactly one primary CTA per
 * surface and going visible is the most important action here. Mirrors
 * `apps/web/app/(app)/arena/looking-for-match-toggle.tsx`.
 */
import * as React from "react";
import { Pressable, Text, View } from "react-native";
import { Plate, LivePill } from "@/components/ui/elo-system";

interface GoLivePlateProps {
  isLive: boolean;
  isSaving: boolean;
  onToggle: () => void;
}

export function GoLivePlate({ isLive, isSaving, onToggle }: GoLivePlateProps) {
  return (
    <Plate variant={isLive ? "live" : "default"}>
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text className="font-heading text-[16px] text-ink">
            Looking for Match
          </Text>
          <Text className="mt-1 font-body text-[13px] text-ink-2">
            {isLive
              ? "You're in the lobby. Opponents can challenge you now."
              : "Go live to appear in the lobby and challenge anyone else who is."}
          </Text>
        </View>
        {isLive ? <LivePill label="Live" /> : null}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: isSaving, busy: isSaving }}
        accessibilityLabel={isLive ? "Go offline" : "Go live"}
        onPress={onToggle}
        disabled={isSaving}
        className={
          isLive
            ? "mt-4 min-h-[44px] items-center justify-center rounded-sm border border-hairline-strong px-5 active:bg-surface-4"
            : "mt-4 min-h-[44px] items-center justify-center rounded-sm bg-cta px-5 active:bg-cta-hover"
        }
        style={isSaving ? { opacity: 0.6 } : undefined}
      >
        <Text
          className={
            isLive
              ? "font-heading text-[12px] text-ink-2 uppercase tracking-caps"
              : "font-heading text-[12px] text-ink-on-cta uppercase tracking-caps"
          }
        >
          {isLive ? "Go offline" : "Go live"}
        </Text>
      </Pressable>
    </Plate>
  );
}
