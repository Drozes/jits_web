/**
 * The one Signal Red CTA on the Arena surface.
 *
 * A button, not a Switch: the brand system allows exactly one primary CTA per
 * surface and going visible is the most important action here. Mirrors
 * `apps/web/app/(app)/arena/looking-for-match-toggle.tsx`.
 */
import * as React from "react";
import { Text, View } from "react-native";
import { DISABLED_OPACITY } from "@/components/ui/elo-system/button";
import { PressableScale } from "@/components/ui/pressable-scale";
import { Plate, LivePill } from "@/components/ui/elo-system";

interface GoLivePlateProps {
  isLive: boolean;
  isSaving: boolean;
  onToggle: () => void;
  /** Replaces the line under the heading (practice has no real opponents). */
  body?: string;
}

export function GoLivePlate({ isLive, isSaving, onToggle, body }: GoLivePlateProps) {
  return (
    <Plate variant={isLive ? "live" : "default"}>
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          {/* Offline is stated as a fact, never as a search already running. */}
          <Text className="font-heading text-subhead text-ink">
            {isLive ? "Looking for a match" : "You're offline"}
          </Text>
          <Text className="mt-1 font-body text-body text-ink-2">
            {body ??
              (isLive
              ? "You're in the lobby. Opponents can challenge you now."
              : "Go live to appear in the lobby and challenge anyone else who is.")}
          </Text>
        </View>
        {isLive ? <LivePill label="Live" /> : null}
      </View>

      {/* Press scale only: going live buzzes `goLive` from the Arena tab
          icon on the live transition, so no press haptic here. */}
      <PressableScale
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
        style={isSaving ? { opacity: DISABLED_OPACITY } : undefined}
      >
        <Text
          className={
            isLive
              ? "font-heading text-small text-ink-2 uppercase tracking-caps"
              : "font-heading text-small text-ink-on-cta uppercase tracking-caps"
          }
        >
          {isLive ? "Go offline" : "Go live"}
        </Text>
      </PressableScale>
    </Plate>
  );
}
