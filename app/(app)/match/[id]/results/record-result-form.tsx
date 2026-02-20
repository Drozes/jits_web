"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Swords, Handshake } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { createClient } from "@/lib/supabase/client";
import { recordMatchResult } from "@/lib/api/mutations";
import { useMatchSync } from "@/hooks/use-match-sync";
import { getInitials, getProfilePhotoUrl, cn } from "@/lib/utils";
import type { MatchParticipant } from "@/lib/api/queries";
import type { SubmissionType } from "@/types/submission-type";
import { SubmissionFields } from "./submission-fields";

interface RecordResultFormProps {
  matchId: string;
  participants: MatchParticipant[];
  submissionTypes: SubmissionType[];
  elapsedSeconds?: number;
}

export function RecordResultForm({
  matchId,
  participants,
  submissionTypes,
  elapsedSeconds,
}: RecordResultFormProps) {
  const router = useRouter();
  const { broadcastResultRecorded } = useMatchSync({
    matchId,
    onResultRecorded: () => router.refresh(),
  });
  const [result, setResult] = useState<"submission" | "draw" | null>(null);
  const [winnerId, setWinnerId] = useState("");
  const [submissionCode, setSubmissionCode] = useState("");
  const [finishTime, setFinishTime] = useState<number | undefined>(
    elapsedSeconds,
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    result === "draw" ||
    (result === "submission" && winnerId && submissionCode);

  async function handleSubmit() {
    if (!result || !canSubmit) return;
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const res = await recordMatchResult(supabase, {
      matchId,
      result,
      winnerId: result === "submission" ? winnerId : undefined,
      submissionTypeCode: result === "submission" ? submissionCode : undefined,
      finishTimeSeconds: result === "submission" ? finishTime : undefined,
    });

    if (!res.ok) {
      setError(res.error.message);
      setLoading(false);
      return;
    }
    broadcastResultRecorded();
    router.refresh();
  }

  return (
    <div className="space-y-6 animate-page-in">
      {error && <p className="text-sm text-red-500 text-center">{error}</p>}

      {/* Result type toggle */}
      <ResultTypeToggle result={result} onSelect={setResult} />

      {/* VS Winner Selection — only for submission */}
      {result === "submission" && (
        <VsWinnerPicker
          participants={participants}
          winnerId={winnerId}
          onSelect={setWinnerId}
        />
      )}

      {/* Submission details */}
      {result === "submission" && winnerId && (
        <div className="animate-slide-up-fade">
          <SubmissionFields
            submissionTypes={submissionTypes}
            submissionCode={submissionCode}
            defaultElapsedSeconds={elapsedSeconds}
            onSubmissionChange={setSubmissionCode}
            onFinishTimeChange={setFinishTime}
          />
        </div>
      )}

      {/* Draw confirmation */}
      {result === "draw" && (
        <div className="animate-slide-up-fade rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-center">
          <Handshake className="mx-auto h-8 w-8 text-amber-500 mb-2" />
          <p className="text-sm font-medium">Match ends in a draw</p>
          <p className="text-xs text-muted-foreground mt-1">
            Both athletes will lose ELO in ranked matches
          </p>
        </div>
      )}

      <Button
        className="w-full h-12 text-base font-semibold"
        size="lg"
        onClick={handleSubmit}
        disabled={!canSubmit || loading}
      >
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Submit Result
      </Button>
    </div>
  );
}

/* ── Result Type Toggle ─────────────────────────────────── */

function ResultTypeToggle({
  result,
  onSelect,
}: {
  result: "submission" | "draw" | null;
  onSelect: (r: "submission" | "draw") => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-muted-foreground">
        How did the match end?
      </p>
      <div className="grid grid-cols-2 gap-2 rounded-xl bg-muted/50 p-1.5">
        <button
          type="button"
          onClick={() => onSelect("submission")}
          className={cn(
            "flex items-center justify-center gap-2 rounded-lg py-3 text-sm font-semibold transition-all",
            result === "submission"
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Swords className="h-4 w-4" />
          Submission
        </button>
        <button
          type="button"
          onClick={() => onSelect("draw")}
          className={cn(
            "flex items-center justify-center gap-2 rounded-lg py-3 text-sm font-semibold transition-all",
            result === "draw"
              ? "bg-amber-500 text-white shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Handshake className="h-4 w-4" />
          Draw
        </button>
      </div>
    </div>
  );
}

/* ── VS Winner Picker ───────────────────────────────────── */

function VsWinnerPicker({
  participants,
  winnerId,
  onSelect,
}: {
  participants: MatchParticipant[];
  winnerId: string;
  onSelect: (id: string) => void;
}) {
  const a = participants[0];
  const b = participants[1];

  return (
    <div className="space-y-3 animate-slide-up-fade">
      <p className="text-sm font-medium text-muted-foreground">Who won?</p>
      <div className="relative flex items-stretch gap-3">
        {a && (
          <AthleteCard
            participant={a}
            selected={winnerId === a.athlete_id}
            onSelect={() => onSelect(a.athlete_id)}
          />
        )}
        {a && b && (
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-muted border-2 border-background text-xs font-black tracking-tight">
              VS
            </span>
          </div>
        )}
        {b && (
          <AthleteCard
            participant={b}
            selected={winnerId === b.athlete_id}
            onSelect={() => onSelect(b.athlete_id)}
          />
        )}
      </div>
      {!winnerId && (
        <p className="text-xs text-muted-foreground text-center">
          Tap to select the winner
        </p>
      )}
    </div>
  );
}

function AthleteCard({
  participant,
  selected,
  onSelect,
}: {
  participant: MatchParticipant;
  selected: boolean;
  onSelect: () => void;
}) {
  const photoUrl = getProfilePhotoUrl(participant.profile_photo_url);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "relative flex-1 flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all",
        selected
          ? "border-primary bg-primary/5 shadow-[0_0_16px_-4px] shadow-primary/25"
          : "border-muted hover:border-muted-foreground/30",
      )}
    >
      {selected && (
        <div className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm animate-scale-in">
          <Check className="h-3.5 w-3.5" strokeWidth={3} />
        </div>
      )}
      <Avatar className={cn("h-14 w-14", selected && "ring-2 ring-primary ring-offset-2 ring-offset-background")}>
        {photoUrl && <AvatarImage src={photoUrl} alt={participant.display_name} />}
        <AvatarFallback className="text-lg font-bold">
          {getInitials(participant.display_name)}
        </AvatarFallback>
      </Avatar>
      <span className="text-sm font-semibold leading-tight text-center">
        {participant.display_name}
      </span>
      <span className="text-xs text-muted-foreground tabular-nums">
        {participant.current_elo} ELO
      </span>
    </button>
  );
}
