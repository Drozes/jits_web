"use client";

import { useState, useEffect } from "react";
import { Swords, Handshake, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { recordMatchResult } from "@jits/shared/api/mutations";
import { useSessionMatchSync, type BroadcastResult } from "@/hooks/use-session-match-sync";
import { SubmissionFields } from "@/app/(app)/match/[id]/results/submission-fields";
import { cn } from "@/lib/utils";
import type { SubmissionType } from "@jits/shared/types/submission-type";

interface Participant { id: string; displayName: string }

interface ResultRecordingStepProps {
  onNext: (data: { resultData: BroadcastResult }) => void;
  matchId: string;
  participants: Participant[];
  submissionTypes: SubmissionType[];
  timekeeperEnabled: boolean;
  isTimekeeper: boolean;
}

export function ResultRecordingStep({ onNext, matchId, participants, submissionTypes, timekeeperEnabled, isTimekeeper }: ResultRecordingStepProps) {
  const isLocked = timekeeperEnabled && !isTimekeeper;
  const [unlocked, setUnlocked] = useState(!isLocked);
  const [result, setResult] = useState<"submission" | "draw" | null>(null);
  const [winnerId, setWinnerId] = useState("");
  const [submissionCode, setSubmissionCode] = useState("");
  const [finishTime, setFinishTime] = useState<number | undefined>();
  const [loading, setLoading] = useState(false);
  const [remainingLock, setRemainingLock] = useState(isLocked ? 60 : 0);

  useEffect(() => {
    if (!isLocked) return;
    const t = setTimeout(() => setUnlocked(true), 60_000);
    return () => clearTimeout(t);
  }, [isLocked]);

  useEffect(() => {
    if (!isLocked) return;
    const id = setInterval(() => {
      setRemainingLock((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [isLocked]);

  const sync = useSessionMatchSync({
    matchId,
    onResultSubmitted: (r) => onNext({ resultData: r }),
  });

  const canSubmit = result === "draw" || (result === "submission" && winnerId && submissionCode);

  async function handleSubmit() {
    if (!result || !canSubmit) return;
    setLoading(true);
    const supabase = createClient();
    const res = await recordMatchResult(supabase, {
      matchId, result,
      winnerId: result === "submission" ? winnerId : undefined,
      submissionTypeCode: result === "submission" ? submissionCode : undefined,
      finishTimeSeconds: result === "submission" ? finishTime : undefined,
    });
    if (!res.ok) { setLoading(false); return; }
    const broadcast: BroadcastResult = { result, winnerId: winnerId || undefined, submissionCode: submissionCode || undefined, finishTimeSeconds: finishTime };
    sync.broadcastResultSubmitted(broadcast);
    onNext({ resultData: broadcast });
  }

  if (!unlocked) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-4">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Waiting for timekeeper... {remainingLock}s
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5 px-4 py-6 max-w-md mx-auto animate-page-in">
      <h2 className="text-lg font-semibold text-center">Record Result</h2>
      <ResultToggle result={result} onSelect={setResult} />
      {result === "submission" && <WinnerPicker participants={participants} winnerId={winnerId} onSelect={setWinnerId} />}
      {result === "submission" && winnerId && (
        <SubmissionFields submissionTypes={submissionTypes} submissionCode={submissionCode} onSubmissionChange={setSubmissionCode} onFinishTimeChange={setFinishTime} />
      )}
      {result === "draw" && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-center">
          <Handshake className="mx-auto h-8 w-8 text-amber-500 mb-2" />
          <p className="text-sm font-medium">Match ends in a draw</p>
        </div>
      )}
      <Button className="w-full h-12 text-base font-semibold" onClick={handleSubmit} disabled={!canSubmit || loading}>
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {loading ? "Recording..." : "Record Result"}
      </Button>
    </div>
  );
}

function ResultToggle({ result, onSelect }: { result: "submission" | "draw" | null; onSelect: (r: "submission" | "draw") => void }) {
  return (
    <div className="grid grid-cols-2 gap-2 rounded-xl bg-muted/50 p-1.5">
      {(["submission", "draw"] as const).map((r) => (
        <button key={r} type="button" onClick={() => onSelect(r)} className={cn(
          "flex items-center justify-center gap-2 rounded-lg py-3 text-sm font-semibold transition-all",
          result === r ? (r === "draw" ? "bg-amber-500 text-white shadow-sm" : "bg-primary text-primary-foreground shadow-sm") : "text-muted-foreground hover:text-foreground",
        )}>
          {r === "submission" ? <Swords className="h-4 w-4" /> : <Handshake className="h-4 w-4" />}
          {r === "submission" ? "Submission" : "Draw"}
        </button>
      ))}
    </div>
  );
}

function WinnerPicker({ participants, winnerId, onSelect }: { participants: Participant[]; winnerId: string; onSelect: (id: string) => void }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-muted-foreground">Who won?</p>
      <div className="grid grid-cols-2 gap-2">
        {participants.map((p) => (
          <button key={p.id} type="button" onClick={() => onSelect(p.id)} className={cn(
            "rounded-xl border-2 p-3 text-sm font-semibold transition-all text-center",
            winnerId === p.id ? "border-primary bg-primary/5" : "border-muted hover:border-muted-foreground/30",
          )}>
            {p.displayName}
          </button>
        ))}
      </div>
    </div>
  );
}
