"use client";

import { useState, useMemo } from "react";
import { GeoCheckStep } from "./steps/geo-check-step";
import { WaiverStep } from "./steps/waiver-step";
import { WeightConfirmStep } from "./steps/weight-confirm-step";
import { ConfirmStep } from "./steps/confirm-step";

type Step = "geo" | "waiver" | "weight" | "confirm";

interface JoinWizardProps {
  sessionId: string;
  gymName: string;
  gymCity: string | null;
  gymLatitude: number | null;
  gymLongitude: number | null;
  athleteWeight: number | null;
  requiresWaiver: boolean;
  hasSignedWaiver: boolean;
  activeWaiverId: string | null;
  currentAthleteId: string;
  currentAthleteName: string;
  currentAthleteElo: number;
  currentAthletePhotoUrl: string | null;
}

export function JoinWizard(props: JoinWizardProps) {
  const {
    sessionId, gymName, gymLatitude, gymLongitude, athleteWeight,
    requiresWaiver, hasSignedWaiver, activeWaiverId,
    currentAthleteId, currentAthleteName, currentAthleteElo, currentAthletePhotoUrl,
  } = props;

  const steps = useMemo(() => {
    const all: Step[] = [];
    if (gymLatitude != null && gymLongitude != null) all.push("geo");
    if (requiresWaiver && !hasSignedWaiver) all.push("waiver");
    all.push("weight");
    all.push("confirm");
    return all;
  }, [gymLatitude, gymLongitude, requiresWaiver, hasSignedWaiver]);

  const [currentStep, setCurrentStep] = useState<Step>(steps[0]);
  const [confirmedWeight, setConfirmedWeight] = useState<number | null>(null);

  function goToNext() {
    const idx = steps.indexOf(currentStep);
    if (idx < steps.length - 1) setCurrentStep(steps[idx + 1]);
  }

  function handleWeightConfirm(weight: number) {
    setConfirmedWeight(weight);
    const idx = steps.indexOf("weight");
    if (idx < steps.length - 1) setCurrentStep(steps[idx + 1]);
  }

  return (
    <div className="space-y-6">
      {/* Progress dots */}
      <div className="flex justify-center gap-2">
        {steps.map((step) => (
          <div
            key={step}
            className={`h-2.5 w-2.5 rounded-full transition-colors ${
              step === currentStep ? "bg-primary" : "bg-muted"
            }`}
          />
        ))}
      </div>

      {currentStep === "geo" && (
        <GeoCheckStep gymLatitude={gymLatitude!} gymLongitude={gymLongitude!} gymName={gymName} onNext={goToNext} />
      )}
      {currentStep === "waiver" && activeWaiverId && (
        <WaiverStep sessionId={sessionId} waiverId={activeWaiverId} onNext={goToNext} />
      )}
      {currentStep === "weight" && (
        <WeightConfirmStep athleteWeight={athleteWeight} onNext={handleWeightConfirm} />
      )}
      {currentStep === "confirm" && confirmedWeight != null && (
        <ConfirmStep
          sessionId={sessionId}
          gymName={gymName}
          confirmedWeight={confirmedWeight}
          currentAthleteId={currentAthleteId}
          currentAthleteName={currentAthleteName}
          currentAthleteElo={currentAthleteElo}
          currentAthletePhotoUrl={currentAthletePhotoUrl}
        />
      )}
    </div>
  );
}
