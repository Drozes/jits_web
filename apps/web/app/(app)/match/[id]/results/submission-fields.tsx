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
import type { SubmissionType } from "@/types/submission-type";

interface SubmissionFieldsProps {
  submissionTypes: SubmissionType[];
  submissionCode: string;
  defaultElapsedSeconds?: number;
  onSubmissionChange: (code: string) => void;
  onFinishTimeChange: (seconds: number | undefined) => void;
}

export function SubmissionFields({
  submissionTypes,
  submissionCode,
  defaultElapsedSeconds,
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
            Finish Time (optional)
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
        </div>
      </CardContent>
    </Card>
  );
}
