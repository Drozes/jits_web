"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, UserPlus, Check } from "lucide-react";
import { toast } from "sonner";
import { buildShareUrl, buildShareText } from "@jits/shared/utils";
import { createClient } from "@/lib/supabase/client";
import { leaveSessionLobby } from "@jits/shared/api/mutations";
import { useSessionLobbyRealtime } from "@/hooks/use-session-lobby-realtime";
import { Button } from "@/components/ui/button";
import type { LobbyParticipant } from "@jits/shared/types/session";
import { ParticipantList } from "./participant-list";
import { SessionChallengeSheet } from "./session-challenge-sheet";
import { SessionChallengeReceivedSheet } from "./session-challenge-received-sheet";
import { RandomMatchButton } from "./random-match-button";

interface Props {
  sessionId: string;
  currentAthleteId: string;
  currentAthleteName: string;
  currentAthleteElo: number;
  currentAthleteWeight: number | null;
  initialParticipants: LobbyParticipant[];
  gymName: string;
}

export function SessionLobbyClient(props: Props) {
  const { sessionId, currentAthleteId, currentAthleteName, currentAthleteElo, currentAthleteWeight, initialParticipants, gymName } = props;
  const router = useRouter();
  const lobby = useSessionLobbyRealtime(sessionId, currentAthleteId, currentAthleteName, currentAthleteElo, initialParticipants);
  const [target, setTarget] = useState<LobbyParticipant | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const activeCount = lobby.participants.filter((p) => p.status !== "left" && p.athleteId !== currentAthleteId).length;

  async function handleInvite() {
    const url = buildShareUrl("session", sessionId);
    const text = buildShareText({ type: "session", data: { gymName } });
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ title: "Join my session on ELO RATED", text, url });
        return;
      } catch { /* user cancelled, fall through to copy */ }
    }
    await navigator.clipboard.writeText(`${text}\n${url}`);
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 2000);
  }

  async function handleLeave() {
    setLeaving(true);
    const result = await leaveSessionLobby(createClient(), sessionId);
    if (!result.ok) {
      toast.error("Failed to leave session");
      setLeaving(false);
      return;
    }
    router.push("/gyms");
  }

  return (
    <div className="space-y-4 animate-page-in">
      <div aria-live="polite" aria-atomic="true" className="sr-only">{lobby.announcement}</div>
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold">{gymName}</h2>
          <p className="text-sm text-muted-foreground">{activeCount} fighter{activeCount !== 1 ? "s" : ""} in lobby</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleInvite}>
          {inviteCopied ? <Check className="mr-1.5 h-3.5 w-3.5 text-green-500" /> : <UserPlus className="mr-1.5 h-3.5 w-3.5" />}
          {inviteCopied ? "Copied!" : "Invite"}
        </Button>
      </div>
      <ParticipantList participants={lobby.participants} currentAthleteId={currentAthleteId} onChallenge={setTarget} busyIds={lobby.busyIds} />
      <RandomMatchButton sessionId={sessionId} />
      <Button variant="outline" className="w-full" onClick={handleLeave} disabled={leaving}>
        <LogOut className="mr-2 h-4 w-4" />
        {leaving ? "Leaving..." : "Leave Session"}
      </Button>
      {target && (
        <SessionChallengeSheet
          open={!!target}
          onOpenChange={(open) => { if (!open) setTarget(null); }}
          sessionId={sessionId}
          currentAthleteElo={currentAthleteElo}
          currentAthleteWeight={currentAthleteWeight}
          currentAthleteName={currentAthleteName}
          opponent={target}
          onSendChallenge={(mt) => { lobby.sendChallenge(target.athleteId, mt); setTarget(null); }}
        />
      )}
      <SessionChallengeReceivedSheet
        open={!!lobby.incomingChallenge}
        onOpenChange={(open) => { if (!open) lobby.clearChallenge(); }}
        challenge={lobby.incomingChallenge}
        onRespond={lobby.respondToChallenge}
      />
    </div>
  );
}
