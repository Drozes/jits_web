/**
 * One-screen setup for an invitee (jr_be spec 016, AC2.4 and AC2.5).
 *
 * Attribution is written first, at the first authenticated moment, so it
 * survives stalling here. Then one screen: waiver, first and last name
 * (prefilled from the account), gender, date of birth (16+), weight. Free
 * agent is set automatically and city is deferred. Saving activates the
 * profile and returns to `app/index.tsx`, which runs the claim.
 */
import * as React from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { Redirect } from "expo-router";
import { recordInviteAttribution } from "@jits/shared/api/invites";
import { TOS_TEXT } from "@jits/shared/utils";
import { AppHeader } from "@/components/layout/app-header";
import { CtaButton, TertiaryButton } from "@/components/auth/auth-buttons";
import { Plate } from "@/components/ui/elo-system";
import { IdentityStep } from "@/components/profile-setup/identity-step";
import { FREE_AGENT_OPTION, type WizardValues } from "@/components/profile-setup/types";
import { InviteBanner } from "@/components/invite/invite-banner";
import { useAuth } from "@/lib/auth/hooks";
import { supabase } from "@/lib/supabase/client";
import { useSetupData } from "@/lib/profile-setup/use-setup-data";
import { useSetupSubmit } from "@/lib/profile-setup/use-setup-submit";
import { isAtLeast16, isValidDateOfBirth } from "@/lib/profile-setup/validation";
import { usePendingInvite } from "@/lib/invites/use-pending-invite";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { cn } from "@/lib/cn";

const UNDERAGE_COPY = "You must be 16 or older to compete on ELO RATED.";

function metaName(meta: Record<string, unknown> | undefined): { first: string; last: string } {
  const given = typeof meta?.given_name === "string" ? meta.given_name : "";
  const family = typeof meta?.family_name === "string" ? meta.family_name : "";
  if (given || family) return { first: given, last: family };
  const full = typeof meta?.full_name === "string" ? meta.full_name : typeof meta?.name === "string" ? meta.name : "";
  const [first = "", ...rest] = full.trim().split(/\s+/);
  return { first, last: rest.join(" ") };
}

export default function InviteSetupScreen() {
  const { user, athlete, signOut } = useAuth();
  const tokens = useThemedTokens();
  const { pending, loaded } = usePendingInvite();
  const setup = useSetupData(user?.id ?? null);
  const [waiverAccepted, setWaiverAccepted] = React.useState(false);
  const [showWaiver, setShowWaiver] = React.useState(false);
  const [values, setValues] = React.useState<WizardValues | null>(null);

  // Attribute before anything else (idempotent server side, first write wins).
  React.useEffect(() => {
    if (!user || !pending) return;
    void recordInviteAttribution(supabase, {
      token: pending.token,
      code: pending.code,
      gateway: pending.gateway,
      firstTouchAt: pending.first_touch_at,
    });
  }, [user, pending]);

  React.useEffect(() => {
    if (values || !setup.data) return;
    const row = setup.data.athlete;
    const meta = metaName(user?.user_metadata as Record<string, unknown> | undefined);
    setValues({
      firstName: row?.first_name ?? meta.first,
      lastName: row?.last_name ?? meta.last,
      weight: row?.current_weight ? String(row.current_weight) : "",
      gymId: FREE_AGENT_OPTION,
      gender: row?.gender ?? "",
      dateOfBirth: row?.date_of_birth ?? "",
      city: row?.city ?? "",
      instagram: "",
      gymInstagram: "",
    });
  }, [setup.data, user, values]);

  const { loading, error, submit } = useSetupSubmit({
    athleteId: setup.data?.athlete?.id ?? null,
    authUserId: user?.id ?? null,
    waiverId: setup.data?.waiverId ?? null,
    isEditing: false,
    onAfterTos: () => {},
    gymInstagramFor: () => ({ visible: false, readOnly: false, storedHandle: null, canManage: false }),
  });

  if (!user) return <Redirect href="/signup" />;
  if (athlete?.status === "active") return <Redirect href="/" />;

  if (!values || !loaded) {
    return (
      <View className="flex-1 items-center justify-center bg-surface gap-4 px-6">
        {setup.error ? (
          <>
            <Text className="font-body text-[14px] text-ink-2 text-center">{setup.error}</Text>
            <CtaButton label="Try Again" onPress={() => void setup.reload()} />
          </>
        ) : (
          <ActivityIndicator color={tokens.textSecondary} accessibilityLabel="Loading setup" />
        )}
      </View>
    );
  }

  const underage = isValidDateOfBirth(values.dateOfBirth) && !isAtLeast16(values.dateOfBirth);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }} className="bg-surface">
      <AppHeader title="Your Profile" />
      <ScrollView contentContainerStyle={{ padding: 24, gap: 20 }} keyboardShouldPersistTaps="handled">
        {pending ? <InviteBanner kind={pending.code ? "challenge" : null} inviterName={null} /> : null}

        <Plate className="gap-3">
          <Pressable
            testID="invite-setup-waiver"
            accessibilityRole="checkbox"
            accessibilityState={{ checked: waiverAccepted }}
            onPress={() => setWaiverAccepted((v) => !v)}
            className="flex-row items-center gap-3"
          >
            <View
              className={cn(
                "h-5 w-5 items-center justify-center rounded-xs border",
                waiverAccepted ? "bg-cta border-cta" : "border-hairline-strong bg-surface-3",
              )}
            >
              {waiverAccepted ? <Text className="font-heading text-[12px] text-ink-on-cta">✓</Text> : null}
            </View>
            <Text className="flex-1 font-body text-[14px] text-ink">
              I accept the ELO RATED terms and liability waiver.
            </Text>
          </Pressable>
          <TertiaryButton label={showWaiver ? "Hide terms" : "Read terms"} onPress={() => setShowWaiver((v) => !v)} />
          {showWaiver ? (
            <ScrollView style={{ maxHeight: 220 }} nestedScrollEnabled className="rounded-sm bg-surface-2 p-3">
              <Text className="font-body text-[12px] text-ink-2 leading-5">{TOS_TEXT}</Text>
            </ScrollView>
          ) : null}
        </Plate>

        {underage ? (
          <Text testID="invite-setup-underage" accessibilityRole="alert" className="font-body text-[14px] text-cta">
            {UNDERAGE_COPY}
          </Text>
        ) : null}
        {!waiverAccepted ? (
          <Text className="font-body text-[12px] text-ink-3">Accept the waiver to continue.</Text>
        ) : null}
        {error ? (
          <Text accessibilityRole="alert" className="font-body text-[14px] text-cta">
            {error}
          </Text>
        ) : null}

        <IdentityStep
          values={values}
          onChange={(patch) => setValues((v) => (v ? { ...v, ...patch } : v))}
          onNext={() => {
            if (!waiverAccepted || underage || loading) return;
            void submit({ ...values, gymId: FREE_AGENT_OPTION });
          }}
        />
        {loading ? <ActivityIndicator color={tokens.textSecondary} accessibilityLabel="Saving profile" /> : null}

        <TertiaryButton label="Sign out" onPress={() => void signOut()} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
