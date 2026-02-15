"use client";

import { useState } from "react";
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
import type { MatchParticipant } from "@/lib/api/queries";
import type { SubmissionType } from "@/types/submission-type";

interface SubmissionFieldsProps {
  participants: MatchParticipant[];
  submissionTypes: SubmissionType[];
  winnerId: string;
  submissionCode: string;
  onWinnerChange: (id: string) => void;
  onSubmissionChange: (code: string) => void;
  onFinishTimeChange: (seconds: number | undefined) => void;
}

export function SubmissionFields({
  participants,
  submissionTypes,
  winnerId,
  submissionCode,
  onWinnerChange,
  onSubmissionChange,
  onFinishTimeChange,
}: SubmissionFieldsProps) {
  const [minutes, setMinutes] = useState("");
  const [seconds, setSeconds] = useState("");

  function updateTime(mins: string, secs: string) {
    setMinutes(mins);
    setSeconds(secs);
    if (mins || secs) {
      onFinishTimeChange(parseInt(mins || "0") * 60 + parseInt(secs || "0"));
    } else {
      onFinishTimeChange(undefined);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 py-4 px-4">
        <div className="space-y-2">
          <Label>Winner</Label>
          <Select value={winnerId} onValueChange={onWinnerChange}>
            <SelectTrigger>
              <SelectValue placeholder="Select winner" />
            </SelectTrigger>
            <SelectContent>
              {participants.map((p) => (
                <SelectItem key={p.athlete_id} value={p.athlete_id}>
                  {p.display_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Submission Type</Label>
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
          <Label>Finish Time (optional)</Label>
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
        </div>
      </CardContent>
    </Card>
  );
}
