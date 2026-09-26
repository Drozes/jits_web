/**
 * Practice match phases built from the real Arena and match-flow leaves.
 * Only presentational components are reused: every real step container is
 * wired to RPCs or a realtime channel, and practice must touch neither.
 */
import * as React from "react";
import { Pressable, Text, View } from "react-native";
import { Plate } from "@/components/ui/elo-system";
import { GoLivePlate } from "@/components/arena/go-live-plate";
import { SectionLabel, WaitingPlate } from "@/components/arena/arena-plates";
import { CompetitorRow } from "@/components/arena/competitor-row";
import { WeightTile } from "@/components/match-flow/steps/weight-step";
import { ReadyPanel } from "@/components/match-flow/steps/ready-panel";
import { ConfirmPanel, ResultBanner } from "@/components/match-flow/steps/confirm-step-panels";
import type { ArenaCompetitor } from "@/lib/arena/use-arena-roster";
import type { BroadcastResult } from "@jits/shared/hooks/use-session-match-sync";
import { PRACTICE_BOT_NAME, type PracticePhase } from "@/lib/practice/constants";
import { cn } from "@/lib/cn";

const BUTTON_STYLES = {
  primary: ["bg-cta active:bg-cta-hover", "text-ink-on-cta"],
  secondary: ["border border-hairline-strong bg-surface-3 active:bg-surface-4", "text-ink"],
  tertiary: ["", "text-ink-3 underline"],
} as const;

export function PracticeButton({
  label,
  onPress,
  variant = "primary",
  testID,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  variant?: keyof typeof BUTTON_STYLES;
  testID?: string;
  disabled?: boolean;
}) {
  const [box, text] = BUTTON_STYLES[variant];
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      onPress={onPress}
      disabled={disabled}
      className={cn(
        "min-h-[44px] items-center justify-center rounded-sm px-5 py-3",
        box,
        disabled && "opacity-50",
      )}
    >
      <Text className={cn("font-heading text-[13px] uppercase tracking-caps", text)}>{label}</Text>
    </Pressable>
  );
}

/** The coach line shown above each phase. */
export function PracticeTip({ text }: { text: string }) {
  return (
    <Plate testID="practice-tip" className="gap-1">
      <Text className="font-mono-bold text-[10px] text-ink-3 uppercase tracking-caps-xl">
        Practice tip
      </Text>
      <Text className="font-body text-[13px] text-ink">{text}</Text>
    </Plate>
  );
}

/** Go live, see the bot in the lobby, challenge it, wait for the accept. */
export function PracticeLobby({
  phase,
  bot,
  onGoLive,
  onGoOffline,
  onChallenge,
  onCancel,
}: {
  phase: Extract<PracticePhase, "offline" | "lobby" | "waiting">;
  bot: ArenaCompetitor;
  onGoLive: () => void;
  onGoOffline: () => void;
  onChallenge: () => void;
  onCancel: () => void;
}) {
  const noop = React.useCallback(() => undefined, []);
  if (phase === "waiting") {
    return <WaitingPlate name={PRACTICE_BOT_NAME} onCancel={onCancel} disabled={false} />;
  }
  const live = phase === "lobby";
  return (
    <View className="gap-4">
      {/* Local only: going live here never touches the real Arena state. */}
      <GoLivePlate isLive={live} isSaving={false} onToggle={live ? onGoOffline : onGoLive} />
      {live ? (
        <>
          <SectionLabel label="Online now" count={1} />
          <CompetitorRow
            competitor={bot}
            inLobby
            action={{ kind: "challenge" }}
            disabled={false}
            onChallenge={onChallenge}
            onGoLive={noop}
            onOpenProfile={noop}
          />
        </>
      ) : null}
    </View>
  );
}

export function PracticeWeight({
  weight,
  onConfirm,
}: {
  weight: number | null;
  onConfirm: () => void;
}) {
  return (
    <View className="gap-5 px-1 py-4">
      <Text className="text-center font-display text-[28px] text-ink tracking-mark">
        ON THE SCALE
      </Text>
      <View className="flex-row justify-center gap-3">
        <WeightTile name="You" weight={weight} />
        <WeightTile name={PRACTICE_BOT_NAME} weight={weight} />
      </View>
      <PracticeButton testID="weight-confirm" label="Confirm Weights" onPress={onConfirm} />
    </View>
  );
}

export function PracticeReady({
  userReady,
  botReady,
  onReady,
  onCancel,
}: {
  userReady: boolean;
  botReady: boolean;
  onReady: () => void;
  onCancel: () => void;
}) {
  return (
    <View className="gap-4">
      <View className="flex-row gap-3">
        <ReadyPanel label="You" ready={userReady} />
        <ReadyPanel label={PRACTICE_BOT_NAME} ready={botReady} testID="ready-panel-opponent" />
      </View>
      {userReady ? null : <PracticeButton testID="ready-button" label="Ready" onPress={onReady} />}
      <PracticeButton label="Cancel" variant="secondary" onPress={onCancel} />
    </View>
  );
}

/** No Dispute button in practice: the coach line explains it instead. */
export function PracticeConfirm({
  result,
  athleteId,
  botConfirmed,
  onConfirm,
}: {
  result: BroadcastResult | null;
  athleteId: string;
  botConfirmed: boolean;
  onConfirm: () => void;
}) {
  return (
    <View className="gap-4">
      {/* Casual copy: never "Your rating is already updated". */}
      <ResultBanner resultData={result} currentAthleteId={athleteId} matchType="casual" />
      <View className="flex-row gap-3">
        <ConfirmPanel label="You" side="you" state="your-call" />
        <ConfirmPanel
          label={PRACTICE_BOT_NAME}
          side="opponent"
          state={botConfirmed ? "confirmed" : "confirming"}
        />
      </View>
      <PracticeButton testID="confirm-result" label="Confirm Result" onPress={onConfirm} />
    </View>
  );
}
