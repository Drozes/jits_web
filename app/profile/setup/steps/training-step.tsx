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
import type { WizardValues } from "../setup-wizard";

interface TrainingStepProps {
  values: WizardValues;
  onChange: (patch: Partial<WizardValues>) => void;
  onNext: () => void;
  gyms: { id: string; name: string }[];
}

export function TrainingStep({ values, onChange, onNext, gyms }: TrainingStepProps) {
  const parsedWeight = values.weight ? parseFloat(values.weight) : null;
  const weightValid = !!parsedWeight && parsedWeight >= 50 && parsedWeight <= 400;
  const canContinue = weightValid && !!values.gymId;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label>Gym</Label>
        <Select value={values.gymId} onValueChange={(v) => onChange({ gymId: v })}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select your gym" />
          </SelectTrigger>
          <SelectContent>
            {gyms.map((gym) => (
              <SelectItem key={gym.id} value={gym.id}>
                {gym.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Required to activate your profile and appear to other athletes.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="weight">Weight (lbs)</Label>
        <Input
          id="weight"
          type="number"
          placeholder="e.g. 155"
          value={values.weight}
          onChange={(e) => onChange({ weight: e.target.value })}
          min={50}
          max={400}
          step={0.1}
        />
        <p className="text-xs text-muted-foreground">Used for weight class matching.</p>
      </div>

      <Button type="button" onClick={onNext} disabled={!canContinue}>
        Continue
      </Button>
    </div>
  );
}
