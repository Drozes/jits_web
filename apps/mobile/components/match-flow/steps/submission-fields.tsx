import * as React from "react";
import { View } from "react-native";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SubmissionType } from "@jits/shared/types/submission-type";

interface SubmissionFieldsProps {
  submissionTypes: SubmissionType[];
  submissionCode: string;
  finishTimeStr: string;
  onSubmissionChange: (v: string) => void;
  onFinishTimeChange: (v: string) => void;
}

/**
 * Submission-type Select + Finish Time input. Used by the result step
 * when the outcome is "submission".
 */
export function SubmissionFields({
  submissionTypes,
  submissionCode,
  finishTimeStr,
  onSubmissionChange,
  onFinishTimeChange,
}: SubmissionFieldsProps) {
  return (
    <View className="gap-3">
      <View className="gap-2">
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
      </View>
      <View className="gap-2">
        <Label>Finish Time (optional)</Label>
        <Input
          placeholder="mm:ss or seconds"
          value={finishTimeStr}
          onChangeText={onFinishTimeChange}
          keyboardType="numeric"
          maxLength={5}
        />
      </View>
    </View>
  );
}
