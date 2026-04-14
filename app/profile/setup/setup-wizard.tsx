"use client";

import { useState, useMemo } from "react";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TosStep } from "./tos-step";
import { IdentityStep } from "./steps/identity-step";
import { TrainingStep } from "./steps/training-step";
import { OptionalStep } from "./steps/optional-step";
import { WizardProgress } from "./wizard-progress";
import { useSetupSubmit } from "./use-setup-submit";

type Step = "tos" | "identity" | "training" | "optional";

const STEP_LABELS: Record<Step, string> = {
  tos: "Welcome to JITS",
  identity: "Who are you?",
  training: "Where do you train?",
  optional: "Optional details",
};

export interface WizardValues {
  displayName: string;
  weight: string;
  gymId: string;
  gender: string;
  dateOfBirth: string;
  city: string;
}

interface SetupWizardProps {
  athleteId: string | null;
  defaults: WizardValues;
  defaultProfilePhotoUrl: string | null;
  gyms: { id: string; name: string }[];
  isEditing: boolean;
  hasAcceptedTos: boolean;
  waiverId?: string;
}

export function SetupWizard({
  athleteId,
  defaults,
  defaultProfilePhotoUrl,
  gyms,
  isEditing,
  hasAcceptedTos,
  waiverId,
}: SetupWizardProps) {
  const steps = useMemo<Step[]>(() => {
    const list: Step[] = [];
    if (!hasAcceptedTos) list.push("tos");
    list.push("identity", "training", "optional");
    return list;
  }, [hasAcceptedTos]);

  const [currentStep, setCurrentStep] = useState<Step>(steps[0]);
  const [values, setValues] = useState<WizardValues>(defaults);
  const currentIdx = steps.indexOf(currentStep);

  const goNext = () => {
    if (currentIdx < steps.length - 1) setCurrentStep(steps[currentIdx + 1]);
  };
  const goBack = () => {
    if (currentIdx > 0) setCurrentStep(steps[currentIdx - 1]);
  };
  const onChange = (patch: Partial<WizardValues>) =>
    setValues((v) => ({ ...v, ...patch }));

  const { loading, error, acceptTos, submit } = useSetupSubmit({
    athleteId,
    waiverId,
    isEditing,
    onAfterTos: goNext,
  });

  return (
    <Card>
      <CardContent className="p-6 flex flex-col gap-6">
        <WizardProgress
          currentIdx={currentIdx}
          total={steps.length}
          label={STEP_LABELS[currentStep]}
        />

        {currentStep === "tos" && <TosStep onAccept={acceptTos} />}
        {currentStep === "identity" && (
          <IdentityStep
            values={values}
            onChange={onChange}
            onNext={goNext}
            athleteId={athleteId}
            defaultProfilePhotoUrl={defaultProfilePhotoUrl}
          />
        )}
        {currentStep === "training" && (
          <TrainingStep values={values} onChange={onChange} onNext={goNext} gyms={gyms} />
        )}
        {currentStep === "optional" && (
          <OptionalStep
            values={values}
            onChange={onChange}
            onSubmit={(skip) => submit(values, skip)}
            loading={loading}
            isEditing={isEditing}
          />
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        {currentIdx > 0 && (
          <Button type="button" variant="ghost" onClick={goBack} disabled={loading}>
            <ChevronLeft className="mr-1 h-4 w-4" />
            Back
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
