"use client";

import { useState } from "react";
import { Clock, Target } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SubmissionType } from "@jits/shared/types/submission-type";
import {
  finishSecondsFromFields,
  formatMatchClock,
  isFinishTimeValid,
} from "@/lib/match-flow/match-state";

interface SubmissionFieldsProps {
  submissionTypes: SubmissionType[];
  submissionCode: string;
  defaultElapsedSeconds?: number;
  /** Match length: the finish time is required and must fall in 1..duration. */
  durationSeconds: number;
  onSubmissionChange: (code: string) => void;
  onFinishTimeChange: (seconds: number | undefined) => void;
}

export function SubmissionFields({
  submissionTypes,
  submissionCode,
  defaultElapsedSeconds,
  durationSeconds,
  onSubmissionChange,
  onFinishTimeChange,
}: SubmissionFieldsProps) {
  const defaultMins = defaultElapsedSeconds
    ? String(Math.floor(defaultElapsedSeconds / 60))
    : "";
  const defaultSecs = defaultElapsedSeconds
    ? String(defaultElapsedSeconds % 60)
    : "";
  const [minutes, setMinutes] = useState(defaultMins);
  const [seconds, setSeconds] = useState(defaultSecs);

  function updateTime(mins: string, secs: string) {
    setMinutes(mins);
    setSeconds(secs);
    onFinishTimeChange(finishSecondsFromFields(mins, secs));
  }

  const entered = finishSecondsFromFields(minutes, seconds);
  const invalid =
    entered !== undefined && !isFinishTimeValid(entered, durationSeconds);

  return (
    <Card>
      <CardContent className="space-y-4 py-4 px-4">
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5 text-muted-foreground">
            <Target className="h-3.5 w-3.5" />
            Submission Type
          </Label>
          <Select value={submissionCode} onValueChange={onSubmissionChange}>
            <SelectTrigger>
              <SelectValue placeholder="Select submission" />
            </SelectTrigger>
            <SelectContent>
              {submissionTypes.map((st) => (
                <SelectItem key={st.code} value={st.code}>
                  {st.display_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="flex items-center gap-1.5 text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            Finish Time
          </Label>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={0}
              max={59}
              placeholder="Min"
              value={minutes}
              onChange={(e) => updateTime(e.target.value, seconds)}
              className="w-20"
            />
            <span className="text-muted-foreground font-bold">:</span>
            <Input
              type="number"
              min={0}
              max={59}
              placeholder="Sec"
              value={seconds}
              onChange={(e) => updateTime(minutes, e.target.value)}
              className="w-20"
            />
          </div>
          {invalid && (
            <p className="text-xs text-destructive">
              Enter a time between 0:01 and {formatMatchClock(durationSeconds)}.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
