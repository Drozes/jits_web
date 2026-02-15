"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Trophy, Handshake } from "lucide-react";
import { cn } from "@/lib/utils";
import { MATCH_RESULT, MATCH_TYPE, type MatchType } from "@/lib/constants";

interface SubmissionType {
  code: string;
  display_name: string;
  category: string;
}

interface RecordResultClientProps {
  matchId: string;
  matchType: MatchType;
  durationSeconds: number;
  elapsedSeconds: number | null;
  currentAthleteId: string;
  currentAthleteName: string;
  rivalAthleteId: string;
  rivalAthleteName: string;
  submissionTypes: SubmissionType[];
}

export function RecordResultClient({
  matchId,
  matchType,
  elapsedSeconds,
  currentAthleteId,
  currentAthleteName,
  rivalAthleteId,
  rivalAthleteName,
  submissionTypes,
}: RecordResultClientProps) {
  const router = useRouter();
  const [result, setResult] = useState<"submission" | "draw" | null>(null);
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [submissionCode, setSubmissionCode] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Group submission types by category
  const grouped = submissionTypes.reduce<Record<string, SubmissionType[]>>(
    (acc, st) => {
      const cat = st.category || "Other";
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(st);
      return acc;
    },
    {},
  );

  async function handleSubmit() {
    if (!result) return;
    if (result === MATCH_RESULT.SUBMISSION && (!winnerId || !submissionCode)) {
      setError("Please select a winner and submission type");
      return;
    }

    setSubmitting(true);
    setError(null);

    const supabase = createClient();

    const rpcParams: Record<string, unknown> = {
      p_match_id: matchId,
      p_result: result,
    };

    if (result === MATCH_RESULT.SUBMISSION) {
      rpcParams.p_winner_id = winnerId;
      rpcParams.p_submission_type_code = submissionCode;
      if (elapsedSeconds != null) {
        rpcParams.p_finish_time_seconds = elapsedSeconds;
      }
    }

    const { error: rpcError } = await supabase.rpc(
      "record_match_result",
      rpcParams,
    );

    setSubmitting(false);

    if (rpcError) {
      setError(rpcError.message);
      return;
    }

    router.refresh();
  }

  const canSubmit =
    result === MATCH_RESULT.DRAW ||
    (result === MATCH_RESULT.SUBMISSION && winnerId && submissionCode);

  return (
    <div className="flex flex-col gap-6">
      {/* Match info */}
      <div className="flex justify-center">
        <Badge
          variant={matchType === MATCH_TYPE.RANKED ? "default" : "outline"}
        >
          {matchType === MATCH_TYPE.RANKED ? "Ranked" : "Casual"}
        </Badge>
      </div>

      {/* Result Type */}
      <div className="flex flex-col gap-2">
        <Label>Result</Label>
        <div className="grid grid-cols-2 gap-3">
          <ResultButton
            selected={result === MATCH_RESULT.SUBMISSION}
            onClick={() => setResult(MATCH_RESULT.SUBMISSION)}
            icon={<Trophy className="h-5 w-5" />}
            label="Submission"
          />
          <ResultButton
            selected={result === MATCH_RESULT.DRAW}
            onClick={() => {
              setResult(MATCH_RESULT.DRAW);
              setWinnerId(null);
              setSubmissionCode(null);
            }}
            icon={<Handshake className="h-5 w-5" />}
            label="Draw"
          />
        </div>
      </div>

      {/* Submission Details */}
      {result === MATCH_RESULT.SUBMISSION && (
        <>
          {/* Winner selection */}
          <div className="flex flex-col gap-2">
            <Label>Winner</Label>
            <div className="grid grid-cols-2 gap-3">
              <Button
                type="button"
                variant={winnerId === currentAthleteId ? "default" : "outline"}
                onClick={() => setWinnerId(currentAthleteId)}
                className="h-auto py-3"
              >
                {currentAthleteName}
                <span className="text-xs opacity-70 ml-1">(You)</span>
              </Button>
              <Button
                type="button"
                variant={winnerId === rivalAthleteId ? "default" : "outline"}
                onClick={() => setWinnerId(rivalAthleteId)}
                className="h-auto py-3"
              >
                {rivalAthleteName}
              </Button>
            </div>
          </div>

          {/* Submission type */}
          <div className="flex flex-col gap-2">
            <Label>Submission Type</Label>
            <Select
              value={submissionCode ?? undefined}
              onValueChange={setSubmissionCode}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select submission..." />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(grouped).map(([category, types]) => (
                  <div key={category}>
                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                      {category}
                    </div>
                    {types.map((st) => (
                      <SelectItem key={st.code} value={st.code}>
                        {st.display_name}
                      </SelectItem>
                    ))}
                  </div>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Finish time */}
          {elapsedSeconds != null && (
            <p className="text-sm text-muted-foreground text-center">
              Finish time:{" "}
              <span className="font-semibold tabular-nums">
                {Math.floor(elapsedSeconds / 60)}:
                {(elapsedSeconds % 60).toString().padStart(2, "0")}
              </span>
            </p>
          )}
        </>
      )}

      {error && <p className="text-sm text-destructive text-center">{error}</p>}

      {/* Submit */}
      <Button
        size="lg"
        className="w-full"
        onClick={handleSubmit}
        disabled={!canSubmit || submitting}
      >
        {submitting ? "Recording..." : "Record Result"}
      </Button>
    </div>
  );
}

function ResultButton({
  selected,
  onClick,
  icon,
  label,
}: {
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-colors",
        selected
          ? "border-primary bg-primary/5 text-primary"
          : "border-muted hover:border-muted-foreground/30",
      )}
    >
      {icon}
      <span className="text-sm font-medium">{label}</span>
    </button>
  );
}
