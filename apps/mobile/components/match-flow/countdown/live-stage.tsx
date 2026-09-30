import * as React from "react";
import type { UseVideoRecorderReturn } from "@/lib/video/use-video-recorder";
import type { LiveParticipant } from "@/lib/match-flow/live-view-state";
import { LiveStep } from "../steps/live-step";
import { COUNTDOWN_MS, Countdown, GoFlash } from "./countdown";

/** How long "GRAPPLE" stays over the live screen after GO. */
export const GO_FLASH_MS = 700;

/**
 * The server `started_at` shifted to GO. The match clock runs from GO, so
 * the countdown never eats the first seconds of the round, and both phones
 * shift by the same amount from the same server timestamp. Unparseable
 * input is returned unchanged (no countdown).
 */
export function clockStartFor(startedAt: string): string {
  const t = Date.parse(startedAt);
  return Number.isFinite(t) ? new Date(t + COUNTDOWN_MS).toISOString() : startedAt;
}

interface LiveStageProps {
  matchId: string;
  me: LiveParticipant;
  opponent: LiveParticipant;
  durationSeconds: number;
  /** The server's `matches.started_at` (NOT shifted). */
  startedAt: string;
  pausedAt: string | null;
  totalPausedDuration: number;
  recorder: UseVideoRecorderReturn;
  /** Record from this phone (decision 5). */
  recording: boolean;
  /** The match's rated weights (challenge), for the countdown's chip. */
  myWeight: number | null;
  opponentWeight: number | null;
  onEnded: (finishSeconds: number) => void;
}

/**
 * The live step with its 3-2-1 in front. Until GO the countdown is up and the
 * live step is not mounted (so nothing can be paused or ended and the
 * recorder is not armed); at GO the frozen live screen mounts with its clock
 * started at GO. Re-entering a match past GO skips straight to live.
 *
 * GO on this device is the server's GO, but never more than one countdown
 * after this step mounted: a phone whose clock runs behind the server's must
 * not sit on "3" for longer than the countdown lasts.
 */
export function LiveStage(props: LiveStageProps) {
  const { startedAt, recording, me, opponent, myWeight, opponentWeight, ...liveProps } = props;
  const [mountedAt] = React.useState(() => Date.now());
  const serverGo = Date.parse(startedAt) + COUNTDOWN_MS;
  const goAt = Number.isFinite(serverGo) ? Math.min(serverGo, mountedAt + COUNTDOWN_MS) : mountedAt;
  const [phase, setPhase] = React.useState<"countdown" | "live">(() => (Date.now() >= goAt ? "live" : "countdown"));
  const [flash, setFlash] = React.useState(false);

  React.useEffect(() => {
    if (phase !== "countdown") return;
    const t = setTimeout(() => {
      setPhase("live");
      setFlash(true);
    }, Math.max(0, goAt - Date.now()));
    return () => clearTimeout(t);
  }, [phase, goAt]);

  React.useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(false), GO_FLASH_MS);
    return () => clearTimeout(t);
  }, [flash]);

  if (phase === "countdown") {
    return (
      <Countdown
        goAt={goAt}
        recording={recording}
        me={me}
        opponent={opponent}
        myWeight={myWeight}
        opponentWeight={opponentWeight}
      />
    );
  }
  return (
    <>
      <LiveStep
        {...liveProps}
        me={me}
        opponent={opponent}
        startedAt={clockStartFor(startedAt)}
        recordingEnabled={recording}
      />
      {flash ? <GoFlash /> : null}
    </>
  );
}
