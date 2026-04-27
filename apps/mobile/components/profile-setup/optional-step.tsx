import * as React from "react";
import { Text, View } from "react-native";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { WizardValues } from "./types";

interface OptionalStepProps {
  values: WizardValues;
  onChange: (patch: Partial<WizardValues>) => void;
  onSubmit: (skipOptional: boolean) => void;
  loading: boolean;
  isEditing: boolean;
}

/**
 * Native port of `apps/web/app/profile/setup/steps/optional-step.tsx`.
 * Web includes a theme picker; mobile does not yet have a theme switcher
 * (system-only via NativeWind), so this step collects `city` only.
 */
export function OptionalStep({
  values,
  onChange,
  onSubmit,
  loading,
  isEditing,
}: OptionalStepProps) {
  return (
    <View className="gap-4">
      <View className="gap-2">
        <Label nativeID="cityLabel">City</Label>
        <Input
          accessibilityLabelledBy="cityLabel"
          placeholder="e.g. Austin, TX"
          value={values.city}
          onChangeText={(text) => onChange({ city: text })}
          maxLength={100}
        />
        <Text className="text-xs text-muted-foreground">
          Helps you find local sessions and gyms.
        </Text>
      </View>

      <Button onPress={() => onSubmit(false)} disabled={loading}>
        {loading ? "Saving..." : isEditing ? "Save Changes" : "Get Started"}
      </Button>
      <Button
        variant="ghost"
        onPress={() => onSubmit(true)}
        disabled={loading}
      >
        Skip for now
      </Button>
    </View>
  );
}
