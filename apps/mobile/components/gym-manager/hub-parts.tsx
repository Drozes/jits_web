/**
 * Presentational sub-components for the gym-owner hub (H1).
 *
 * Layout only: the parent (gym-manager/index.tsx) loads data via useGymHub and
 * wires navigation. All styling uses ELO design tokens; numeric values use
 * font-mono tabular-nums per the brand rule.
 */
import * as React from "react";
import { Pressable, Text, View } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { LivePill, Plate } from "@/components/ui/elo-system";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { formatCountdown } from "@/lib/gym-manager/format-countdown";
import type { SessionListItem } from "@jits/shared/types/session";

/** Mono-caps tertiary section heading (wireframe `.section-label`). */
export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text className="font-mono-bold text-[10px] text-ink-3 uppercase tracking-caps-xl">
      {children}
    </Text>
  );
}

function formatSessionMeta(iso: string): string {
  return new Date(iso)
    .toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })
    .toUpperCase();
}

interface NextSessionPlateProps {
  session: SessionListItem | null;
  isLive: boolean;
  onPress: () => void;
}

/**
 * The accent plate at the top of the hub. Shows the live session (or soonest
 * upcoming) with a countdown + RSVP/eligible meta. Empty state when no session
 * is scheduled.
 */
export function NextSessionPlate({ session, isLive, onPress }: NextSessionPlateProps) {
  if (!session) {
    return (
      <View className="rounded-md border border-dashed border-hairline p-5 bg-surface-3 items-center">
        <Text className="font-mono-bold text-[10px] text-ink-3 uppercase tracking-caps-l">
          No Sessions Scheduled
        </Text>
      </View>
    );
  }

  const attending = session.rsvpCount + session.participantCount;
  const capacity = session.maxParticipants;
  const metaLine = capacity
    ? `${attending} RSVP'D · ${capacity} CAP`
    : `${attending} RSVP'D`;

  return (
    <Pressable onPress={onPress} accessibilityRole="button">
      <Plate variant={isLive ? "live" : "accent"}>
        <View className="flex-row items-start justify-between gap-3 mb-3">
          <View className="flex-1">
            <Text
              className="font-heading text-[18px] text-ink leading-[22px]"
              numberOfLines={1}
            >
              {session.title ?? "Open Mat"}
            </Text>
            <Text className="font-mono text-[10px] text-ink-3 uppercase tracking-caps-l mt-0.5">
              {formatSessionMeta(session.scheduledStart)}
            </Text>
          </View>
          {isLive ? (
            <LivePill label="Live" />
          ) : (
            <Text className="font-heading text-[11px] text-cta uppercase tracking-caps">
              Next
            </Text>
          )}
        </View>
        <Text
          className="font-mono-bold text-[28px] text-ink"
          style={{ letterSpacing: -0.5, fontVariant: ["tabular-nums"] }}
        >
          {isLive ? "NOW" : formatCountdown(session.scheduledStart)}
        </Text>
        <Text className="font-mono text-[10px] text-ink-3 uppercase tracking-caps-l mt-2">
          {metaLine}
        </Text>
      </Plate>
    </Pressable>
  );
}

/** Caps-label + mono number tile (wireframe `.metric-tile`). */
export function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-1 bg-surface-3 border border-hairline rounded-md px-4 py-3 min-h-[72px] justify-center gap-1">
      <Text className="font-mono-bold text-[10px] text-ink-3 uppercase tracking-caps-xl">
        {label}
      </Text>
      <Text
        className="font-mono-bold text-[28px] text-ink leading-none"
        style={{ fontVariant: ["tabular-nums"] }}
      >
        {value}
      </Text>
    </View>
  );
}

/** Two-up metric row (wireframe `.metric-grid`). */
export function MetricGrid({ children }: { children: React.ReactNode }) {
  return <View className="flex-row gap-3">{children}</View>;
}

interface ShortcutTileProps {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
}

/** Icon + heading nav tile (wireframe `.shortcut-tile`). */
export function ShortcutTile({ icon: Icon, label, onPress }: ShortcutTileProps) {
  const tokens = useThemedTokens();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="flex-1 bg-surface-3 border border-hairline rounded-md p-3 min-h-[84px] justify-between items-start active:bg-surface-4"
    >
      <View pointerEvents="none">
        <Icon size={18} color={tokens.textTertiary} />
      </View>
      <Text className="font-heading text-[13px] text-ink uppercase tracking-caps leading-[15px]">
        {label}
      </Text>
    </Pressable>
  );
}

/** Three-up shortcut row (wireframe `.shortcut-grid`). */
export function ShortcutGrid({ children }: { children: React.ReactNode }) {
  return <View className="flex-row gap-2">{children}</View>;
}
