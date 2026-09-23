/**
 * Home's challenge inbox: what is outstanding right now, in both directions.
 *
 * Fed by `lib/arena/use-challenge-inbox.ts`; see that file for why the list
 * exists and why it is not part of the cached dashboard payload.
 *
 * It renders NOTHING when there is nothing outstanding. Home is a landing
 * screen, not a mailbox, and an "0 challenges" plate on every cold start would
 * cost the one thing an inbox is for: the row being there means something is
 * waiting on you. A failed read is the exception, because silence would then
 * be a claim ("nothing waiting") the app cannot actually make.
 */
import * as React from "react";
import { Pressable, Text, View } from "react-native";
import { MetaTag, Plate } from "@/components/ui/elo-system";
import type { PendingChallenge } from "@jits/shared/types/composites";

/**
 * How long this challenge has left, in the coarsest unit that still says
 * something useful.
 *
 * NOT `formatTimeUntil` from `@jits/shared/utils`: that one is bound to
 * sessions ("Starts in 20 min") and returns null past two hours, which is
 * where nearly every challenge lives, `expires_at` defaulting to seven days
 * out. Different question, different answer.
 */
export function formatExpiresIn(expiresAt: string, now: number = Date.now()): string {
  const ms = new Date(expiresAt).getTime() - now;
  if (ms <= 0) return "Expired";

  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "Expires in under a minute";
  if (minutes < 60) return `Expires in ${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Expires in ${hours} hr`;

  const days = Math.floor(hours / 24);
  return `Expires in ${days} ${days === 1 ? "day" : "days"}`;
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <Text className="font-mono-bold text-[10px] text-ink-2 uppercase tracking-caps-xl">
      {children}
    </Text>
  );
}

function CtaButton({
  label,
  onPress,
  disabled,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
  accessibilityLabel: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      onPress={onPress}
      disabled={disabled}
      className="min-h-[44px] flex-1 items-center justify-center rounded-sm bg-cta active:bg-cta-hover"
      style={disabled ? { opacity: 0.6 } : undefined}
    >
      <Text className="font-heading text-[12px] text-ink-on-cta uppercase tracking-caps">
        {label}
      </Text>
    </Pressable>
  );
}

function OutlineButton({
  label,
  onPress,
  disabled,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  disabled: boolean;
  accessibilityLabel: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      onPress={onPress}
      disabled={disabled}
      className="min-h-[44px] flex-1 items-center justify-center rounded-sm border border-hairline-strong px-5 active:bg-surface-4"
      style={disabled ? { opacity: 0.6 } : undefined}
    >
      <Text className="font-heading text-[12px] text-ink-2 uppercase tracking-caps">
        {label}
      </Text>
    </Pressable>
  );
}

/** Someone challenged this athlete. The only actionable direction. */
function IncomingRow({
  challenge,
  locked,
  onAccept,
  onDecline,
}: {
  challenge: PendingChallenge;
  locked: boolean;
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <Plate variant="accent">
      <Label>Incoming</Label>
      <Text className="mt-1 font-heading text-[16px] text-ink">
        {challenge.challengerName} challenged you
      </Text>
      <Text
        className="mt-1 font-mono text-[11px] text-ink-3 uppercase tracking-caps-l"
        style={{ fontVariant: ["tabular-nums"] }}
      >
        {formatExpiresIn(challenge.expiresAt)}
      </Text>
      <Text className="mt-2 font-body text-[13px] text-ink-2">
        Accept and you both drop straight into the match.
      </Text>
      <View className="mt-4 flex-row gap-2">
        <OutlineButton
          label="Decline"
          onPress={onDecline}
          disabled={locked}
          accessibilityLabel={`Decline challenge from ${challenge.challengerName}`}
        />
        <CtaButton
          label="Accept"
          onPress={onAccept}
          disabled={locked}
          accessibilityLabel={`Accept challenge from ${challenge.challengerName}`}
        />
      </View>
    </Plate>
  );
}

/** This athlete's own challenge, still unanswered. */
function OutgoingRow({
  challenge,
  locked,
  onCancel,
}: {
  challenge: PendingChallenge;
  locked: boolean;
  onCancel: () => void;
}) {
  return (
    <Plate>
      <Label>Sent</Label>
      <Text className="mt-1 font-heading text-[16px] text-ink">
        Waiting for {challenge.opponentName}
      </Text>
      <Text
        className="mt-1 font-mono text-[11px] text-ink-3 uppercase tracking-caps-l"
        style={{ fontVariant: ["tabular-nums"] }}
      >
        {formatExpiresIn(challenge.expiresAt)}
      </Text>
      <Text className="mt-2 font-body text-[13px] text-ink-2">
        They haven{"’"}t answered yet. Cancelling frees one of your three
        challenge slots.
      </Text>
      <View className="mt-4 flex-row">
        <OutlineButton
          label="Cancel"
          onPress={onCancel}
          disabled={locked}
          accessibilityLabel={`Cancel challenge to ${challenge.opponentName}`}
        />
      </View>
    </Plate>
  );
}

/** Accepted while the athlete was here, and not yet walked into. */
function ReadyRow({
  challenge,
  locked,
  onEnter,
}: {
  challenge: PendingChallenge;
  locked: boolean;
  onEnter: () => void;
}) {
  return (
    <Plate variant="live">
      <Label>Accepted</Label>
      <Text className="mt-1 font-heading text-[16px] text-ink">
        {challenge.opponentName} accepted
      </Text>
      <Text className="mt-2 font-body text-[13px] text-ink-2">
        They{"’"}re waiting on the mat. Open the match to get started.
      </Text>
      <View className="mt-4 flex-row">
        <CtaButton
          label="Enter match →"
          onPress={onEnter}
          disabled={locked}
          accessibilityLabel={`Enter match with ${challenge.opponentName}`}
        />
      </View>
    </Plate>
  );
}

export interface PendingChallengesSectionProps {
  incoming: PendingChallenge[];
  outgoing: PendingChallenge[];
  ready: PendingChallenge[];
  /** The challenge currently being acted on; null when idle. */
  busyId: string | null;
  loadFailed: boolean;
  onAccept: (challengeId: string) => void;
  onDecline: (challengeId: string) => void;
  onCancel: (challengeId: string) => void;
  onEnter: (challengeId: string) => void;
  onRetry: () => void;
}

export function PendingChallengesSection({
  incoming,
  outgoing,
  ready,
  busyId,
  loadFailed,
  onAccept,
  onDecline,
  onCancel,
  onEnter,
  onRetry,
}: PendingChallengesSectionProps) {
  const total = incoming.length + outgoing.length + ready.length;

  if (total === 0 && !loadFailed) return null;

  // One action at a time across the section: you cannot accept two challenges,
  // and a second tap while the first is mid-handshake would create a second
  // match the athlete then has to abandon.
  const locked = busyId !== null;

  return (
    <View className="gap-3" testID="pending-challenges">
      <View className="flex-row items-end justify-between">
        <MetaTag>Challenges</MetaTag>
        {total > 0 ? (
          <Text
            className="font-mono-bold text-[10px] text-ink uppercase tracking-caps-l"
            style={{ fontVariant: ["tabular-nums"] }}
          >
            {total}
          </Text>
        ) : null}
      </View>

      {loadFailed ? (
        <Plate variant="accent">
          <Label>Couldn{"’"}t load</Label>
          <Text className="mt-1 font-body text-[13px] text-ink">
            We couldn{"’"}t check your challenges, so this list may not be
            showing everything that is waiting on you.
          </Text>
          <View className="mt-4 flex-row">
            <OutlineButton
              label="Retry"
              onPress={onRetry}
              disabled={false}
              accessibilityLabel="Retry loading challenges"
            />
          </View>
        </Plate>
      ) : null}

      {ready.map((c) => (
        <ReadyRow
          key={c.challengeId}
          challenge={c}
          locked={locked}
          onEnter={() => onEnter(c.challengeId)}
        />
      ))}

      {incoming.map((c) => (
        <IncomingRow
          key={c.challengeId}
          challenge={c}
          locked={locked}
          onAccept={() => onAccept(c.challengeId)}
          onDecline={() => onDecline(c.challengeId)}
        />
      ))}

      {outgoing.map((c) => (
        <OutgoingRow
          key={c.challengeId}
          challenge={c}
          locked={locked}
          onCancel={() => onCancel(c.challengeId)}
        />
      ))}
    </View>
  );
}
