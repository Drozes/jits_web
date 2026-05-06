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
import { isIdentityComplete } from "@/lib/profile-setup/validation";
import type { WizardValues } from "./types";
import { DateOfBirthPicker } from "./date-of-birth-picker";

interface IdentityStepProps {
  values: WizardValues;
  onChange: (patch: Partial<WizardValues>) => void;
  onNext: () => void;
}

export function IdentityStep({ values, onChange, onNext }: IdentityStepProps) {
  const canContinue = isIdentityComplete(values);

  return (
    <View className="gap-4">
      <View className="gap-2">
        <Label nativeID="displayNameLabel">Display Name</Label>
        <Input
          accessibilityLabelledBy="displayNameLabel"
          placeholder="Enter your fighter name"
          value={values.displayName}
          onChangeText={(text: string) => onChange({ displayName: text })}
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

      <DateOfBirthPicker
        value={values.dateOfBirth}
        onChange={(dateOfBirth) => onChange({ dateOfBirth })}
      />

      <Button onPress={onNext} disabled={!canContinue}>
        Continue
      </Button>
    </View>
  );
}
