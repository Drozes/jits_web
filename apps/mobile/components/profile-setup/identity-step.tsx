import * as React from "react";
import { Text, View } from "react-native";
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
import { isAtLeast16, isIdentityComplete, isValidDateOfBirth } from "@/lib/profile-setup/validation";
import type { WizardValues } from "./types";

interface IdentityStepProps {
  values: WizardValues;
  onChange: (patch: Partial<WizardValues>) => void;
  onNext: () => void;
}

/**
 * Native port of `apps/web/app/profile/setup/steps/identity-step.tsx`.
 * No date picker dependency: DOB is collected as a YYYY-MM-DD text input
 * with format and age validation (>= 16, mirroring web).
 */
export function IdentityStep({ values, onChange, onNext }: IdentityStepProps) {
  const dobAttempted = values.dateOfBirth.length > 0;
  const dobFormatValid = !dobAttempted || isValidDateOfBirth(values.dateOfBirth);
  const dobAgeValid = !dobAttempted || isAtLeast16(values.dateOfBirth);
  const canContinue = isIdentityComplete(values);

  return (
    <View className="gap-4">
      <View className="gap-2">
        <Label nativeID="displayNameLabel">Display Name</Label>
        <Input
          accessibilityLabelledBy="displayNameLabel"
          placeholder="Enter your fighter name"
          value={values.displayName}
          onChangeText={(text) => onChange({ displayName: text })}
          maxLength={30}
          autoFocus
        />
        <Text className="text-xs text-muted-foreground">
          This is how other athletes will see you. You can change it later.
        </Text>
      </View>

      <View className="gap-2">
        <Label>Gender</Label>
        <Select
          value={values.gender || undefined}
          onValueChange={(v) => onChange({ gender: v })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select gender" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="M">Male</SelectItem>
            <SelectItem value="F">Female</SelectItem>
          </SelectContent>
        </Select>
        <Text className="text-xs text-muted-foreground">
          Used for competition brackets.
        </Text>
      </View>

      <View className="gap-2">
        <Label nativeID="dobLabel">Date of Birth</Label>
        <Input
          accessibilityLabelledBy="dobLabel"
          placeholder="YYYY-MM-DD"
          value={values.dateOfBirth}
          onChangeText={(text) => onChange({ dateOfBirth: text })}
          autoCapitalize="none"
          keyboardType="numbers-and-punctuation"
          maxLength={10}
        />
        {!dobFormatValid && (
          <Text className="text-xs text-destructive">
            Enter your date of birth as YYYY-MM-DD.
          </Text>
        )}
        {dobFormatValid && !dobAgeValid && (
          <Text className="text-xs text-destructive">
            You must be at least 16 to compete.
          </Text>
        )}
        <Text className="text-xs text-muted-foreground">
          You must be at least 16 to compete.
        </Text>
      </View>

      <Button onPress={onNext} disabled={!canContinue}>
        Continue
      </Button>
    </View>
  );
}
