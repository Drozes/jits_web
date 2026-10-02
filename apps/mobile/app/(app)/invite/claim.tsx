/**
 * Claim runner (jr_be spec 016, M7): takes the pending invite, reads a
 * location, claims, then lands on the face-off (both on the mat), the booking,
 * a new friendship (join link) or the named error state (contract 7). Never
 * leaves the invitee on Home.
 *
 * A link opened on an account that existed before the link was captured may
 * be the wrong account (a shared phone), so nothing is claimed until the
 * athlete confirms "Signed in as <name>" (AC3.3). A code typed in the app,
 * or a link that led through signup, runs straight away.
 */
import * as React from "react";
import { ActivityIndicator, Linking, ScrollView, Text, View } from "react-native";
import { Redirect, useRouter, type Href } from "expo-router";
import { ACCURACY_TOO_LOW_COPY, DOB_REQUIRED_COPY, LOCATION_DENIED_COPY } from "@jits/shared/utils";
import { AppHeader } from "@/components/layout/app-header";
import { Plate } from "@/components/ui/elo-system";
import { Button } from "@/components/ui/elo-system/button";
import { ClaimDobStep } from "@/components/invite/claim-dob-step";
import { useAuth } from "@/lib/auth/hooks";
import { usePendingInvite } from "@/lib/invites/use-pending-invite";
import { useClaimRunner } from "@/lib/invites/use-claim-runner";
import { INVITE_SETUP_HREF } from "@/lib/invites/launch-route";
import { clearPendingInvite } from "@/lib/invites/pending-invite";
import { isNewAccountForInvite } from "@/lib/invites/claim-flow";
import { ARENA_HREF, arenaMatchHref } from "@/lib/arena/constants";
import { isInArenaMatch } from "@/lib/arena/arena-store";
import { readMatchLocationRequired } from "@/lib/arena/match-location-flag";
import { useThemedTokens } from "@/lib/theme/use-theme";

export default function InviteClaimScreen() {
  const router = useRouter();
  const tokens = useThemedTokens();
  const { user, athlete, signOut, refreshAthleteSoft } = useAuth();
  const { pending, loaded } = usePendingInvite();
  const newAccount = pending ? isNewAccountForInvite(user?.created_at, pending.first_touch_at) : false;
  const { state, run, locationDenied, submitDob, dobError } = useClaimRunner(pending, athlete?.status, {
    newAccount,
    athleteId: athlete?.id ?? null,
    // The saved date of birth must reach the auth context's athlete row too.
    onDobSaved: () => void refreshAthleteSoft(),
    // Flag off: no location prompt, the claim books and Start match starts it.
    readLocationRequired: readMatchLocationRequired,
  });
  const needsConfirm = Boolean(pending?.token) && !newAccount && pending?.gateway !== "paste";
  const [confirmed, setConfirmed] = React.useState(false);

  React.useEffect(() => {
    if (loaded && pending && state.phase === "idle" && (!needsConfirm || confirmed)) void run();
  }, [loaded, pending, state.phase, run, needsConfirm, confirmed]);

  // "Not you?": sign out but keep the pending invite, then let the launch
  // router send the right person to signup with the banner.
  const notMe = async () => {
    await signOut();
    router.replace("/");
  };

  // "Not now": this account does not want the invite. Drop it, or every cold
  // launch would bring the athlete back here until the link expires.
  const notNow = async () => {
    await clearPendingInvite();
    router.replace(ARENA_HREF as Href);
  };

  const step = state.phase === "done" ? state.step : null;
  // The DOB step stays mounted while it saves (same slot, so its picked date
  // survives a failed save); the runner returns to it on failure.
  const savingDob = state.phase === "saving_dob";
  const dobMessage = step?.type === "dob" ? step.message : savingDob ? DOB_REQUIRED_COPY : null;

  React.useEffect(() => {
    if (!step) return;
    if (step.type === "go_match" && !isInArenaMatch()) {
      router.replace(arenaMatchHref(step.matchId) as Href);
    } else if (step.type === "setup") {
      router.replace(INVITE_SETUP_HREF);
    } else if (step.type === "message" && !step.terminal && pending?.code) {
      // A wrong code or a throttle belongs on the code entry screen.
      const until = step.retryAfterS ? Date.now() + step.retryAfterS * 1000 : null;
      void clearPendingInvite().then(() =>
        router.replace({
          pathname: "/invite-code",
          params: { msg: step.message, ...(until ? { until: String(until) } : {}) },
        } as Href),
      );
    }
  }, [step, router, pending?.code]);

  if (loaded && !pending && !step) return <Redirect href="/" />;

  const name = athlete?.display_name ?? null;
  const awaitingConfirm = Boolean(pending) && needsConfirm && !confirmed && state.phase === "idle";

  return (
    <View className="flex-1 bg-surface">
      <AppHeader title="Challenge" back backFallback={ARENA_HREF as Href} />
      <ScrollView contentContainerStyle={{ padding: 24, gap: 20 }}>
        {awaitingConfirm ? (
          <Plate className="gap-4" testID="claim-confirm">
            <Text className="font-heading text-title text-ink uppercase tracking-caps">Open this invite?</Text>
            <Text className="font-body text-callout text-ink leading-6">
              Signed in as {name ?? "your account"}. Not you? Sign out and the invite waits for the right account.
            </Text>
            <Button label="Continue" onPress={() => setConfirmed(true)} />
            <Button variant="secondary" label="Sign out" onPress={() => void notMe()} />
            <Button variant="ghost" height={44} label="Not now" onPress={() => void notNow()} />
          </Plate>
        ) : name && !step && !savingDob ? (
          <View className="flex-row flex-wrap items-center gap-x-2" testID="claim-signed-in-as">
            <Text className="font-body text-small text-ink-3">Signed in as {name}. Not you?</Text>
            <Button variant="ghost" height={28} style={{ paddingHorizontal: 0 }} label="Sign out" onPress={() => void notMe()} />
          </View>
        ) : null}

        {step?.type === "go_match" && isInArenaMatch() ? (
          <Plate className="gap-4" testID="claim-match-ready">
            <Text className="font-heading text-title text-ink uppercase tracking-caps">Your match is ready</Text>
            <Text className="font-body text-callout text-ink leading-6">
              Finish your current match, then start this one.
            </Text>
            <Button label="Go to the match" onPress={() => router.replace(arenaMatchHref(step.matchId) as Href)} />
          </Plate>
        ) : null}

        {!awaitingConfirm && !savingDob && (!step || (step.type === "go_match" && !isInArenaMatch()) || step.type === "setup") ? (
          <View className="items-center gap-3 py-10" accessibilityLiveRegion="polite">
            <ActivityIndicator color={tokens.textSecondary} />
            <Text className="font-body text-callout text-ink-2">
              {state.phase === "locating"
                ? "Checking you're on the mat..."
                : state.phase === "checking"
                  ? "Opening your invite..."
                  : "Accepting the challenge..."}
            </Text>
          </View>
        ) : null}

        {step?.type === "booked" ? (
          <Plate className="gap-4" testID="claim-booked">
            <Text className="font-heading text-title text-ink uppercase tracking-caps">Booked</Text>
            <Text className="font-body text-callout text-ink leading-6">{step.message}</Text>
            {locationDenied ? <LocationOff /> : null}
            <Button label="Go to the Arena" onPress={() => router.replace(`${ARENA_HREF}?booking=${step.challengeId}` as Href)} />
          </Plate>
        ) : null}

        {step?.type === "friends" ? (
          <Plate className="gap-4" testID="claim-friends">
            <Text className="font-body text-subhead text-ink leading-6">
              {step.already ? `You and ${step.inviterName} are already friends.` : `You and ${step.inviterName} are now friends.`}
            </Text>
            <Button label="Go to the Arena" onPress={() => router.replace(ARENA_HREF as Href)} />
          </Plate>
        ) : null}

        {dobMessage ? (
          <ClaimDobStep
            message={dobMessage}
            error={dobError}
            busy={savingDob}
            onSubmit={(dob) => void submitDob(dob)}
            onNotNow={() => void notNow()}
          />
        ) : null}

        {step?.type === "retry_location" ? (
          <Plate className="gap-4" testID="claim-accuracy">
            <Text accessibilityRole="alert" className="font-body text-callout text-ink leading-6">
              {ACCURACY_TOO_LOW_COPY}
            </Text>
            <Button label="Try again" onPress={() => void run()} />
          </Plate>
        ) : null}

        {step?.type === "message" ? (
          <Plate className="gap-4" testID="claim-message">
            <Text accessibilityRole="alert" className="font-body text-callout text-ink leading-6">
              {step.message}
            </Text>
            {step.terminal ? (
              <Button label="Go to the Arena" onPress={() => router.replace(ARENA_HREF as Href)} />
            ) : (
              <>
                {pending?.code ? (
                  <Button
                    label="Enter the code again"
                    onPress={() => {
                      void clearPendingInvite();
                      router.replace("/invite-code");
                    }}
                  />
                ) : (
                  <Button label="Try again" onPress={() => void run()} />
                )}
                <Button
                  variant="secondary"
                  label="Not now"
                  onPress={() => {
                    void clearPendingInvite();
                    router.replace(ARENA_HREF as Href);
                  }}
                />
              </>
            )}
          </Plate>
        ) : null}
      </ScrollView>
    </View>
  );
}

function LocationOff() {
  return (
    <View className="gap-2" testID="claim-location-off">
      <Text className="font-body text-body text-ink-2 leading-5">{LOCATION_DENIED_COPY}</Text>
      <Button variant="secondary" label="Open Settings" onPress={() => void Linking.openSettings()} />
    </View>
  );
}
