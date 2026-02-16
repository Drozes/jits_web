"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import { recordMatchResult } from "@/lib/api/mutations";
import { useMatchSync } from "@/hooks/use-match-sync";
import type { MatchParticipant } from "@/lib/api/queries";
import type { SubmissionType } from "@/types/submission-type";
import { SubmissionFields } from "./submission-fields";

interface RecordResultFormProps {
  matchId: string;
  participants: MatchParticipant[];
  submissionTypes: SubmissionType[];
}

export function RecordResultForm({
  matchId,
  participants,
  submissionTypes,
}: RecordResultFormProps) {
  const router = useRouter();
  const { broadcastResultRecorded } = useMatchSync({
    matchId,
    onResultRecorded: () => router.refresh(),
  });
  const [result, setResult] = useState<"submission" | "draw" | null>(null);
  const [winnerId, setWinnerId] = useState("");
  const [submissionCode, setSubmissionCode] = useState("");
  const [finishTime, setFinishTime] = useState<number | undefined>();
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
    <div className="space-y-6">
      {error && <p className="text-sm text-red-500 text-center">{error}</p>}

      <div className="space-y-2">
        <Label>How did the match end?</Label>
        <div className="grid grid-cols-2 gap-3">
          <Button
            variant={result === "submission" ? "default" : "outline"}
            className="h-14"
            onClick={() => setResult("submission")}
          >
            Submission
          </Button>
          <Button
            variant={result === "draw" ? "default" : "outline"}
            className="h-14"
            onClick={() => setResult("draw")}
          >
            Draw
          </Button>
        </div>
      </div>

      {result === "submission" && (
        <SubmissionFields
          participants={participants}
          submissionTypes={submissionTypes}
          winnerId={winnerId}
          submissionCode={submissionCode}
          onWinnerChange={setWinnerId}
          onSubmissionChange={setSubmissionCode}
          onFinishTimeChange={setFinishTime}
        />
      )}

      <Button
        className="w-full"
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
