import * as React from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { TertiaryButton } from "@/components/auth/auth-buttons";
import { useAuth } from "@/lib/auth/hooks";
import { useSetupSubmit } from "@/lib/profile-setup/use-setup-submit";
import type { GymOption, SetupAthleteRow } from "@/lib/profile-setup/use-setup-data";
import { IdentityStep } from "./identity-step";
import { TosStep } from "./tos-step";
import { TrainingStep } from "./training-step";
import { FREE_AGENT_OPTION, type WizardStep, type WizardValues } from "./types";
import { WizardProgress } from "./wizard-progress";

const STEP_LABELS: Record<WizardStep, string> = {
  tos: "End User Agreement",
  identity: "Who Are You",
  training: "Where You Train",
};

/**
 * Best-effort first/last name from the auth session's metadata, used to prefill
 * the identity step for SSO signups. Google ID-token sign-in populates
 * `given_name`/`family_name` (and `name`/`full_name`); email/password signups
 * have none, so this returns blanks. Birthdate is not provided by Google, so it
 * always stays a manual field.
 */
function deriveSsoName(meta: Record<string, unknown> | undefined): {
  first: string;
  last: string;
} {
  if (!meta) return { first: "", last: "" };
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const given = str(meta.given_name);
  const family = str(meta.family_name);
  if (given || family) return { first: given, last: family };
  const full = str(meta.full_name) || str(meta.name);
  if (!full) return { first: "", last: "" };
  const parts = full.split(/\s+/);
  return { first: parts[0] ?? "", last: parts.slice(1).join(" ") };
}

interface SetupWizardProps {
  authUserId: string;
  athlete: SetupAthleteRow | null;
  gyms: GymOption[];
  cities: string[];
  waiverId: string | null;
  hasAcceptedTos: boolean;
  isEditing: boolean;
}

/** ELO-styled multi-step setup wizard. */
export function SetupWizard({
  authUserId,
  athlete,
  gyms,
  cities,
  waiverId,
  hasAcceptedTos,
  isEditing,
}: SetupWizardProps) {
  const router = useRouter();
  const { signOut, user } = useAuth();
  const ssoName = deriveSsoName(
    user?.user_metadata as Record<string, unknown> | undefined,
  );

  const steps = React.useMemo<WizardStep[]>(() => {
    const list: WizardStep[] = [];
    if (!hasAcceptedTos) list.push("tos");
    list.push("identity", "training");
    return list;
  }, [hasAcceptedTos]);

  const [currentStep, setCurrentStep] = React.useState<WizardStep>(steps[0]);
  const [values, setValues] = React.useState<WizardValues>({
    // New signups have no athlete row yet; fall back to the SSO-provided name so
    // Google users don't retype what we already know. Existing names win.
    firstName: athlete?.first_name || ssoName.first,
    lastName: athlete?.last_name || ssoName.last,
    weight: athlete?.current_weight?.toString() ?? "",
    // No pre-selection for new signups: gymId starts empty so the user must
    // actively pick a real gym or free agent. The edit flow seeds the existing
    // gym, or the free-agent sentinel when the athlete is already a free agent.
    gymId: athlete?.free_agent
      ? FREE_AGENT_OPTION
      : (athlete?.primary_gym_id ?? ""),
    gender: athlete?.gender ?? "",
    dateOfBirth: athlete?.date_of_birth ?? "",
    city: athlete?.city ?? "",
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

  const handleExit = React.useCallback(async () => {
    await signOut();
    router.replace("/login");
  }, [signOut, router]);

  return (
    <View className="gap-6">
      <WizardProgress
        currentIdx={currentIdx}
        total={steps.length}
        label={STEP_LABELS[currentStep]}
      />

      {currentStep === "tos" && (
        <TosStep onAccept={acceptTos} onExit={handleExit} />
      )}
      {currentStep === "identity" && (
        <IdentityStep values={values} onChange={onChange} onNext={goNext} />
      )}
      {currentStep === "training" && (
        <TrainingStep
          values={values}
          onChange={onChange}
          onSubmit={(v) => submit(v)}
          loading={loading}
          isEditing={isEditing}
          gyms={gyms}
          cities={cities}
        />
      )}

      {error ? (
        <Text className="font-body text-[13px] text-negative text-center">
          {error}
        </Text>
      ) : null}

      {currentIdx > 0 && currentStep !== "tos" && (
        <TertiaryButton label="Back" onPress={goBack} disabled={loading} />
      )}

      {/* Sign-out escape hatch on the identity/training steps. The TOS step
          renders its own "Exit" affordance, so it is excluded here to avoid a
          duplicate. Without this, a pending athlete who accepted TOS in a prior
          session lands on the identity step (which has no Back) and is trapped
          with no way to switch accounts. */}
      {currentStep !== "tos" && (
        <TertiaryButton label="Sign Out" onPress={handleExit} disabled={loading} />
      )}
    </View>
  );
}
