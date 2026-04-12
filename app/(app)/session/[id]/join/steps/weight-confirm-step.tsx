"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface WeightConfirmStepProps {
  athleteWeight: number | null;
  onNext: (confirmedWeight: number) => void;
}

export function WeightConfirmStep({ athleteWeight, onNext }: WeightConfirmStepProps) {
  const [weight, setWeight] = useState(athleteWeight?.toString() ?? "");

  const parsedWeight = parseFloat(weight);
  const isValid = !isNaN(parsedWeight) && parsedWeight > 0;

  return (
    <div className="space-y-4 py-4">
      <h2 className="text-center text-lg font-semibold">Confirm your weight</h2>
      <p className="text-center text-sm text-muted-foreground">
        Your weight is used for fair matchmaking.
      </p>
      <div className="flex items-center gap-3">
        <Input
          type="number"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          placeholder="Enter weight"
          className="rounded-xl"
          min={1}
          step="0.1"
        />
        <span className="text-sm font-medium text-muted-foreground">lbs</span>
      </div>
      <Button
        onClick={() => onNext(parsedWeight)}
        disabled={!isValid}
        className="w-full rounded-xl"
      >
        Confirm
      </Button>
    </div>
  );
}
