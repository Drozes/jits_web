"use client";

import { useState, useRef } from "react";
import type { SubmissionType } from "@jits/shared/types/submission-type";
import type { BroadcastResult } from "@jits/shared/hooks/use-session-match-sync";
import { TimekeeperWaitStep } from "./steps/timekeeper-wait-step";
import { WeightVerifyStep } from "./steps/weight-verify-step";
import { ReadyCheckStep } from "./steps/ready-check-step";
import { FighterLiveStep } from "./steps/fighter-live-step";
import { TimekeeperLiveStep } from "./steps/timekeeper-live-step";
import { ResultRecordingStep } from "./steps/result-recording-step";
import { MatchSummaryStep } from "./steps/match-summary-step";
import { MatchRecordedStep } from "./steps/match-recorded-step";

export type MatchFlowStep =
  | "timekeeper-wait" | "weight-verify" | "ready-check"
  | "fighter-live" | "timekeeper-live"
  | "result-recording" | "match-summary" | "match-recorded";

interface AthleteInfo { id: string; displayName: string; elo: number; weight: number | null; profilePhotoUrl: string | null }

interface MatchFlowWizardProps {
  sessionId: string; matchId: string; matchType: "casual" | "ranked";
  durationSeconds: number; startedAt: string | null; pausedAt: string | null; totalPausedDuration: number;
  currentAthlete: AthleteInfo; opponent: AthleteInfo;
  isTimekeeper: boolean; timekeeperEnabled: boolean;
  submissionTypes: SubmissionType[]; initialStep: MatchFlowStep; matchStatus: string;
}

export function MatchFlowWizard(props: MatchFlowWizardProps) {
  const { sessionId, matchId, matchType, matchStatus, durationSeconds, currentAthlete, opponent, isTimekeeper, timekeeperEnabled, submissionTypes, initialStep } = props;
  const [step, setStep] = useState<MatchFlowStep>(initialStep);
  const [startedAt, setStartedAt] = useState(props.startedAt);
  const resultRef = useRef<BroadcastResult | null>(null);

  function handleNext(data?: { resultData?: BroadcastResult; startedAt?: string }) {
    if (data?.startedAt) setStartedAt(data.startedAt);
    if (data?.resultData) resultRef.current = data.resultData;
    const transitions: Record<MatchFlowStep, MatchFlowStep | null> = {
      "timekeeper-wait": "weight-verify",
      "weight-verify": "ready-check",
      "ready-check": isTimekeeper && timekeeperEnabled ? "timekeeper-live" : "fighter-live",
      "fighter-live": "result-recording",
      "timekeeper-live": "result-recording",
      "result-recording": "match-summary",
      "match-summary": "match-recorded",
      "match-recorded": null,
    };
    const next = transitions[step];
    if (next) setStep(next);
  }

  switch (step) {
    case "timekeeper-wait":
      return <TimekeeperWaitStep onNext={handleNext} matchId={matchId} />;
    case "weight-verify":
      return <WeightVerifyStep onNext={handleNext} currentAthlete={currentAthlete} opponent={opponent} matchType={matchType} />;
    case "ready-check":
      return <ReadyCheckStep onNext={handleNext} matchId={matchId} currentAthleteId={currentAthlete.id} opponentId={opponent.id} timekeeperEnabled={timekeeperEnabled} isTimekeeper={isTimekeeper} />;
    case "fighter-live":
      return <FighterLiveStep onNext={handleNext} matchId={matchId} durationSeconds={durationSeconds} startedAt={startedAt ?? ""} pausedAt={props.pausedAt} totalPausedDuration={props.totalPausedDuration} matchType={matchType} timekeeperEnabled={timekeeperEnabled} />;
    case "timekeeper-live":
      return <TimekeeperLiveStep onNext={handleNext} matchId={matchId} durationSeconds={durationSeconds} startedAt={startedAt ?? ""} pausedAt={props.pausedAt} totalPausedDuration={props.totalPausedDuration} />;
    case "result-recording":
      return <ResultRecordingStep onNext={handleNext} matchId={matchId} participants={[{ id: currentAthlete.id, displayName: currentAthlete.displayName }, { id: opponent.id, displayName: opponent.displayName }]} submissionTypes={submissionTypes} timekeeperEnabled={timekeeperEnabled} isTimekeeper={isTimekeeper} />;
    case "match-summary":
      return <MatchSummaryStep onNext={handleNext} matchId={matchId} matchType={matchType} matchStatus={matchStatus} currentAthleteId={currentAthlete.id} opponent={opponent} resultData={resultRef.current} />;
    case "match-recorded":
      return <MatchRecordedStep sessionId={sessionId} matchId={matchId} />;
  }
}
