"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProfilePhotoUpload } from "@/components/profile/profile-photo-upload";
import type { WizardValues } from "../setup-wizard";
import { DateOfBirthPicker, isAtLeast16 } from "./date-of-birth-picker";

interface IdentityStepProps {
  values: WizardValues;
  onChange: (patch: Partial<WizardValues>) => void;
  onNext: () => void;
  athleteId: string | null;
  defaultProfilePhotoUrl: string | null;
}

export function IdentityStep({
  values,
  onChange,
  onNext,
  athleteId,
  defaultProfilePhotoUrl,
}: IdentityStepProps) {
  const canContinue =
    !!values.displayName.trim() &&
    !!values.gender &&
    !!values.dateOfBirth &&
    isAtLeast16(values.dateOfBirth);

  return (
    <div className="flex flex-col gap-4">
      {athleteId && (
        <ProfilePhotoUpload
          athleteId={athleteId}
          displayName={values.displayName}
          profilePhotoUrl={defaultProfilePhotoUrl}
        />
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="displayName">Display Name</Label>
        <Input
          id="displayName"
          placeholder="Enter your fighter name"
          value={values.displayName}
          onChange={(e) => onChange({ displayName: e.target.value })}
          maxLength={30}
          autoFocus
        />
        <p className="text-xs text-muted-foreground">
          This is how other athletes will see you. You can change it later.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Gender</Label>
        <Select value={values.gender} onValueChange={(v) => onChange({ gender: v })}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select gender" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="M">Male</SelectItem>
            <SelectItem value="F">Female</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">Used for competition brackets.</p>
      </div>

      <DateOfBirthPicker
        value={values.dateOfBirth}
        onChange={(dateOfBirth) => onChange({ dateOfBirth })}
      />

      <Button type="button" onClick={onNext} disabled={!canContinue}>
        Continue
      </Button>
    </div>
  );
}
