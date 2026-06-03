import * as React from "react";
import { Pressable, Text, View } from "react-native";
import { ChevronLeft } from "lucide-react-native";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { ConfirmStep } from "./wizard/confirm-step";
import { GeoStep } from "./wizard/geo-step";
import { WaiverStep } from "./wizard/waiver-step";
import { WeightStep } from "./wizard/weight-step";
import { WizardProgress } from "./wizard-progress";

type Step = "geo" | "waiver" | "weight" | "confirm";

const STEP_LABELS: Record<Step, string> = {
  geo: "Location",
  waiver: "Waiver",
  weight: "Weight",
  confirm: "Confirm",
};

interface JoinWizardProps {
  sessionId: string;
  gymName: string;
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

/**
 * Native port of `apps/web/app/(app)/session/[id]/join/join-wizard.tsx`.
 *
 * Step list is computed once based on which checks are required:
 *   - geo: included iff gym has lat/lon
 *   - waiver: included iff session requires it AND athlete hasn't signed
 *   - weight + confirm: always
 *
 * Navigation is forward-only inside each step (each step renders its own
 * primary cta) plus a small "Back" link rendered here for everything past
 * the first step.
 */
export function JoinWizard(props: JoinWizardProps) {
  const tokens = useThemedTokens();
  const {
    sessionId,
    gymName,
    gymLatitude,
    gymLongitude,
    athleteWeight,
    requiresWaiver,
    hasSignedWaiver,
    activeWaiverId,
    currentAthleteId,
    currentAthleteName,
    currentAthleteElo,
    currentAthletePhotoUrl,
  } = props;

  const steps = React.useMemo<Step[]>(() => {
    const list: Step[] = [];
    if (gymLatitude != null && gymLongitude != null) list.push("geo");
    if (requiresWaiver && !hasSignedWaiver && activeWaiverId) list.push("waiver");
    list.push("weight", "confirm");
    return list;
  }, [gymLatitude, gymLongitude, requiresWaiver, hasSignedWaiver, activeWaiverId]);

  const [currentStep, setCurrentStep] = React.useState<Step>(steps[0]);
  const [confirmedWeight, setConfirmedWeight] = React.useState<number | null>(null);
  const currentIdx = steps.indexOf(currentStep);

  const goNext = React.useCallback(() => {
    if (currentIdx < steps.length - 1) setCurrentStep(steps[currentIdx + 1]);
  }, [currentIdx, steps]);

  const goBack = React.useCallback(() => {
    if (currentIdx > 0) setCurrentStep(steps[currentIdx - 1]);
  }, [currentIdx, steps]);

  const handleWeightConfirm = React.useCallback(
    (weight: number) => {
      setConfirmedWeight(weight);
      const idx = steps.indexOf("weight");
      if (idx < steps.length - 1) setCurrentStep(steps[idx + 1]);
    },
    [steps],
  );

  return (
    <View className="gap-6">
      <WizardProgress
        currentIdx={currentIdx}
        total={steps.length}
        label={STEP_LABELS[currentStep]}
      />

      {currentStep === "geo" && gymLatitude != null && gymLongitude != null && (
        <GeoStep
          gymLatitude={gymLatitude}
          gymLongitude={gymLongitude}
          gymName={gymName}
          onNext={goNext}
        />
      )}
      {currentStep === "waiver" && activeWaiverId && (
        <WaiverStep
          sessionId={sessionId}
          waiverId={activeWaiverId}
          onNext={goNext}
        />
      )}
      {currentStep === "weight" && (
        <WeightStep athleteWeight={athleteWeight} onNext={handleWeightConfirm} />
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

      {currentIdx > 0 && (
        <Pressable
          accessibilityRole="button"
          onPress={goBack}
          className="flex-row items-center justify-center gap-1 py-2 active:opacity-70"
          hitSlop={6}
        >
          <View pointerEvents="none">
            <ChevronLeft size={16} color={tokens.textSecondary} />
          </View>
          <Text className="font-mono-bold text-[10px] text-ink-2 uppercase tracking-caps-l">
            Back
          </Text>
        </Pressable>
      )}
    </View>
  );
}
