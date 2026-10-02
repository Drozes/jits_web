/**
 * Practice match phases built from the real Arena and match-flow leaves.
 * Only presentational components are reused: every real step container is
 * wired to RPCs or a realtime channel, and practice must touch neither.
 *
 * The lobby phase deliberately keeps the pre-Mat-Board plates (GoLivePlate,
 * WaitingPlate, CompetitorRow under an "Online now" label): the real Arena
 * is now the Mat Board (`components/arena/mat-board.tsx`), and bringing this
 * walkthrough in line with it is a follow-up, not part of that rebuild
 * (recorded in specs/arena-live-chip/spec.md section 11, "Practice
 * walkthrough on the Mat Board", which carries the tracker reference).
 */
import * as React from "react";
import { Text, View } from "react-native";
import { Plate } from "@/components/ui/elo-system";
import { Button } from "@/components/ui/elo-system/button";
import { GoLivePlate } from "@/components/arena/go-live-plate";
import { SectionLabel, WaitingPlate } from "@/components/arena/arena-plates";
import { CompetitorRow } from "@/components/arena/competitor-row";
import { WeightTile } from "@/components/match-flow/steps/weight-step";
import { ReadyPanel } from "@/components/match-flow/steps/ready-panel";
import { ConfirmPanel, ResultBanner } from "@/components/match-flow/steps/confirm-step-panels";
import type { ArenaCompetitor } from "@/lib/arena/use-arena-roster";
import type { BroadcastResult } from "@jits/shared/hooks/use-session-match-sync";
import {
  PRACTICE_BOT_NAME,
  PRACTICE_LOBBY_BODY,
  type PracticePhase,
} from "@/lib/practice/constants";

/** The coach line shown above each phase. */
export function PracticeTip({ text }: { text: string }) {
  return (
    <Plate testID="practice-tip" className="gap-1">
      <Text className="font-mono-bold tabular-nums text-micro text-ink-3 uppercase tracking-caps-xl">
        Practice tip
      </Text>
      <Text className="font-body text-body text-ink">{text}</Text>
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
      <GoLivePlate
        isLive={live}
        isSaving={false}
        onToggle={live ? onGoOffline : onGoLive}
        body={live ? PRACTICE_LOBBY_BODY : undefined}
      />
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
            ratingLabel="No rating"
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
      <Text className="text-center font-display text-headline-xl text-ink tracking-mark">
        ON THE SCALE
      </Text>
      <View className="flex-row justify-center gap-3">
        <WeightTile name="You" weight={weight} />
        <WeightTile name={PRACTICE_BOT_NAME} weight={weight} />
      </View>
      <Button height={44} testID="weight-confirm" label="Confirm Weights" onPress={onConfirm} />
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
      {userReady ? null : <Button height={44} testID="ready-button" label="Ready" onPress={onReady} />}
      <Button height={44} label="Cancel" variant="secondary" onPress={onCancel} />
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
      {/* Practice is unrated: the subtitle overrides "Your rating is already updated". */}
      <ResultBanner
        resultData={result}
        currentAthleteId={athleteId}
        kicker="Practice result"
        subtitle="Confirm if this is right."
      />
      <View className="flex-row gap-3">
        <ConfirmPanel label="You" side="you" state="your-call" />
        <ConfirmPanel
          label={PRACTICE_BOT_NAME}
          side="opponent"
          state={botConfirmed ? "confirmed" : "confirming"}
        />
      </View>
      <Button height={44} testID="confirm-result" label="Confirm Result" onPress={onConfirm} />
    </View>
  );
}
