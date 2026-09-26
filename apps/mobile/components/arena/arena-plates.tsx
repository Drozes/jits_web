/**
 * The Arena's non-roster surfaces: waiting, capped, failed, empty.
 *
 * Every one of these is a state the screen can actually reach, and each says
 * what happened and what to do next. None of them is a spinner that never
 * resolves or a toast thrown over a list that is lying about its contents.
 */
import * as React from "react";
import { Pressable, Text, View } from "react-native";
import { Plate, LivePill } from "@/components/ui/elo-system";

function OutlineButton({
  label,
  onPress,
  disabled,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      onPress={onPress}
      disabled={disabled}
      className="mt-4 min-h-[44px] items-center justify-center rounded-sm border border-hairline-strong px-5 active:bg-surface-4"
      style={disabled ? { opacity: 0.6 } : undefined}
    >
      <Text className="font-heading text-[12px] text-ink-2 uppercase tracking-caps">
        {label}
      </Text>
    </Pressable>
  );
}

/** Section heading with its own count, so the split stays readable at zero. */
export function SectionLabel({
  label,
  count,
}: {
  label: string;
  count: number;
}) {
  return (
    <View className="flex-row items-baseline justify-between">
      <Text className="font-mono-bold text-[10px] text-ink-2 uppercase tracking-caps-xl">
        {label}
      </Text>
      <Text
        className="font-mono-bold text-[10px] text-ink uppercase tracking-caps-xl"
        style={{ fontVariant: ["tabular-nums"] }}
      >
        {count}
      </Text>
    </View>
  );
}

/** Shown to the challenger while the opponent decides. */
export function WaitingPlate({
  name,
  onCancel,
  disabled,
}: {
  name: string;
  onCancel: () => void;
  disabled: boolean;
}) {
  return (
    <Plate variant="live" testID="arena-waiting-plate">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1">
          <Text className="font-heading text-[16px] text-ink">
            Waiting for {name}
          </Text>
          <Text className="mt-1 font-body text-[13px] text-ink-2">
            You&apos;ll both drop into the match the moment they accept.
          </Text>
        </View>
        <LivePill label="Sent" />
      </View>
      <OutlineButton
        label="Cancel"
        onPress={onCancel}
        disabled={disabled}
        accessibilityLabel="Cancel challenge"
      />
    </Plate>
  );
}

/**
 * The server's cap, stated plainly.
 *
 * `can_create_challenge()` allows at most 3 non-expired pending outgoing
 * challenges and it runs inside the `challenges_insert` RLS WITH CHECK, so the
 * fourth insert is refused by the database. That is a rule, not a hiccup, and
 * it gets a standing explanation rather than a toast that scrolls away.
 *
 * By the time it shows, the challenge hook has already withdrawn the
 * athlete's own stale (over 10 minutes) challenges and retried once
 * (jits-celf), so the three still counted are recent ones. The athlete can
 * only see one of them, so the copy does not ask them to cancel one; it says
 * when the slots come back.
 */
export function CapPlate({ onDismiss }: { onDismiss: () => void }) {
  return (
    <Plate variant="accent">
      <Text className="font-mono-bold text-[10px] text-ink-2 uppercase tracking-caps-xl">
        Challenge limit
      </Text>
      <Text className="mt-1 font-heading text-[16px] text-ink">
        You have 3 challenges out
      </Text>
      <Text className="mt-1 font-body text-[13px] text-ink-2">
        That is the limit. Unanswered challenges clear automatically after 10
        minutes, so try again shortly.
      </Text>
      <OutlineButton label="Got it" onPress={onDismiss} />
    </Plate>
  );
}

/** The roster read failed. Distinct from an empty roster, on purpose. */
export function RosterErrorPlate({ onRetry }: { onRetry: () => void }) {
  return (
    <Plate variant="accent">
      <Text className="font-mono-bold text-[10px] text-ink-2 uppercase tracking-caps-xl">
        Couldn&apos;t load
      </Text>
      <Text className="mt-1 font-body text-[13px] text-ink">
        We couldn&apos;t reach the lobby, so this list is not showing who is
        actually here.
      </Text>
      <OutlineButton label="Retry" onPress={onRetry} />
    </Plate>
  );
}

/** Nobody is flagged as looking at all. */
export function EmptyLobbyPlate({ isLive }: { isLive: boolean }) {
  return (
    <Plate variant="accent">
      <Text className="font-mono-bold text-[10px] text-ink-2 uppercase tracking-caps-xl">
        Lobby empty
      </Text>
      <Text className="mt-2 font-body text-[13px] text-ink">
        {isLive
          ? "You're live, but nobody else is yet. You'll show up here for them the moment they arrive."
          : "When athletes go live, they show up here. Go live above and be the first."}
      </Text>
    </Plate>
  );
}

/**
 * Roster has people, but none of them are present right now. The viewer may
 * be live themselves, so "nobody" never includes them, and the copy never
 * promises that the offline rows below can take a challenge.
 */
export function NobodyOnlineNote({ isLive }: { isLive: boolean }) {
  return (
    <Text className="font-body text-[13px] text-ink-2">
      {isLive
        ? "Nobody else is live right now. Stay live and anyone who goes live shows up here."
        : "Nobody is live right now. Go live and you'll be first in the lobby."}
    </Text>
  );
}

/**
 * Arrived from a match summary's Rematch (`/arena?rematch=<id>`) while that
 * opponent is not in the lobby. Their row pins to the top of Online now the
 * moment they are; this line says so. The name is
 * known only when they are on the roster, so it falls back to a neutral one.
 */
export function RematchHint({ name }: { name: string | null }) {
  return (
    <Text
      testID="arena-rematch-hint"
      className="font-body text-[12px] text-ink-3"
    >
      {`${name ?? "Your opponent"} isn't back in the Arena yet. Their Challenge button appears here the moment they are.`}
    </Text>
  );
}
