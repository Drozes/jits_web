import * as React from "react";
import { Text, View } from "react-native";
import { Button } from "@/components/ui/button";
import { useSetupSubmit } from "@/lib/profile-setup/use-setup-submit";
import type { GymOption, SetupAthleteRow } from "@/lib/profile-setup/use-setup-data";
import { IdentityStep } from "./identity-step";
import { OptionalStep } from "./optional-step";
import { TosStep } from "./tos-step";
import { TrainingStep } from "./training-step";
import type { WizardStep, WizardValues } from "./types";
import { WizardProgress } from "./wizard-progress";

const STEP_LABELS: Record<WizardStep, string> = {
  tos: "Welcome to ELO RATED",
  identity: "Who are you?",
  training: "Where do you train?",
  optional: "Optional details",
};

interface SetupWizardProps {
  authUserId: string;
  athlete: SetupAthleteRow | null;
  gyms: GymOption[];
  waiverId: string | null;
  hasAcceptedTos: boolean;
  isEditing: boolean;
}

/** Native port of `apps/web/app/profile/setup/setup-wizard.tsx`. */
export function SetupWizard({
  authUserId,
  athlete,
  gyms,
  waiverId,
  hasAcceptedTos,
  isEditing,
}: SetupWizardProps) {
  const steps = React.useMemo<WizardStep[]>(() => {
    const list: WizardStep[] = [];
    if (!hasAcceptedTos) list.push("tos");
    list.push("identity", "training", "optional");
    return list;
  }, [hasAcceptedTos]);

  const [currentStep, setCurrentStep] = React.useState<WizardStep>(steps[0]);
  const [values, setValues] = React.useState<WizardValues>({
    displayName: athlete?.display_name ?? "",
    weight: athlete?.current_weight?.toString() ?? "",
    gymId: athlete?.primary_gym_id ?? "",
    gender: athlete?.gender ?? "",
    dateOfBirth: athlete?.date_of_birth ?? "",
    city: athlete?.city ?? "",
    freeAgent: athlete?.free_agent ?? false,
  });
  const currentIdx = steps.indexOf(currentStep);

  const goNext = React.useCallback(() => {
    if (currentIdx < steps.length - 1) setCurrentStep(steps[currentIdx + 1]);
  }, [currentIdx, steps]);
  const goBack = React.useCallback(() => {
    if (currentIdx > 0) setCurrentStep(steps[currentIdx - 1]);
  }, [currentIdx, steps]);
  const onChange = React.useCallback(
    (patch: Partial<WizardValues>) => setValues((v) => ({ ...v, ...patch })),
    [],
  );

  const { loading, error, acceptTos, submit } = useSetupSubmit({
    athleteId: athlete?.id ?? null,
    authUserId,
    waiverId,
    isEditing,
    onAfterTos: goNext,
  });

  return (
    <View className="gap-6">
      <WizardProgress
        currentIdx={currentIdx}
        total={steps.length}
        label={STEP_LABELS[currentStep]}
      />

      {currentStep === "tos" && <TosStep onAccept={acceptTos} />}
      {currentStep === "identity" && (
        <IdentityStep values={values} onChange={onChange} onNext={goNext} />
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

      {error ? <Text className="text-sm text-destructive">{error}</Text> : null}

      {currentIdx > 0 && (
        <Button variant="ghost" onPress={goBack} disabled={loading}>
          Back
        </Button>
      )}
    </View>
  );
}
