"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
  gyms: { id: string; name: string; city: string | null }[];
}

export function TrainingStep({ values, onChange, onNext, gyms }: TrainingStepProps) {
  const parsedWeight = values.weight ? parseFloat(values.weight) : null;
  const weightValid = !!parsedWeight && parsedWeight >= 50 && parsedWeight <= 400;
  const hasGymOrFreeAgent = values.freeAgent || !!values.gymId;
  const canContinue = weightValid && hasGymOrFreeAgent;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5 pr-3">
          <Label htmlFor="free-agent">Train independently</Label>
          <p className="text-xs text-muted-foreground">
            No primary gym? You can update this later.
          </p>
        </div>
        <Switch
          id="free-agent"
          checked={values.freeAgent}
          onCheckedChange={(next) =>
            onChange({ freeAgent: next, gymId: next ? "" : values.gymId })
          }
        />
      </div>

      {!values.freeAgent && (
        <div className="flex flex-col gap-2">
          <Label>Gym</Label>
          <Select
            value={values.gymId}
            onValueChange={(v) => {
              const gym = gyms.find((g) => g.id === v);
              const patch: Partial<WizardValues> = { gymId: v };
              if (gym?.city && !values.city) patch.city = gym.city;
              onChange(patch);
            }}
          >
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
      )}

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
