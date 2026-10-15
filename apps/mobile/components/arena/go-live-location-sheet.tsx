/**
 * The Go Live location states (`match_location_required` ON, contract 6):
 * explain before the system prompt, denied with Open Settings and Retry, a
 * reading too coarse to use, Precise Location off (live location fixes 3a),
 * and no fix in time. Driven by `lib/arena/go-live-location.ts`
 * and mounted once by `<ArenaBootstrap />`. A centered RN Modal by design
 * (DESIGN.md, "Inputs and overlays": it gates the system location prompt);
 * the hardware back answers "Not now", which never takes the athlete live.
 * Fades in, or appears in place under Reduce Motion.
 */
import { ActivityIndicator, Linking, Modal, Platform, Text, View } from "react-native";
import {
  GO_LIVE_ACCURACY_COPY,
  GO_LIVE_LOCATION_DENIED_COPY,
  GO_LIVE_LOCATION_EXPLAIN_COPY,
  IMPLAUSIBLE_MOVEMENT_COPY,
  LOCATION_UNAVAILABLE_COPY,
  PRECISE_LOCATION_COPY,
  PRECISE_LOCATION_COPY_ANDROID,
  PRECISE_LOCATION_TITLE,
  PRECISE_LOCATION_TITLE_ANDROID,
} from "@jits/shared/utils";
import { Button } from "@/components/ui/elo-system/button";
import {
  answerGoLiveLocation,
  useGoLiveLocationSheet,
  type GoLiveLocationPhase,
} from "@/lib/arena/go-live-location";
import { useModalAnimation } from "@/lib/motion";

/** Android names the switch differently and keeps it under Apps > Permissions (jits-mafl.2 M4). */
function preciseCopy(): { title: string; body: string } {
  return Platform.OS === "android"
    ? { title: PRECISE_LOCATION_TITLE_ANDROID, body: PRECISE_LOCATION_COPY_ANDROID }
    : { title: PRECISE_LOCATION_TITLE, body: PRECISE_LOCATION_COPY };
}

const TITLES: Record<Exclude<GoLiveLocationPhase, "precise">, string> = {
  explain: "Location to go live",
  denied: "Location is off",
  accuracy: "Location too rough",
  unavailable: "No location",
  movement: "Location check",
};

const BODY: Record<Exclude<GoLiveLocationPhase, "precise">, string> = {
  explain: GO_LIVE_LOCATION_EXPLAIN_COPY,
  denied: GO_LIVE_LOCATION_DENIED_COPY,
  accuracy: GO_LIVE_ACCURACY_COPY,
  unavailable: LOCATION_UNAVAILABLE_COPY,
  movement: IMPLAUSIBLE_MOVEMENT_COPY,
};

function titleFor(phase: GoLiveLocationPhase, purpose: string | undefined): string {
  if (phase === "precise") return preciseCopy().title;
  return purpose === "arena" && phase === "explain" ? "Location to start" : TITLES[phase];
}

/** The states fixed only in Settings: Open Settings, Retry, Not now. */
const SETTINGS_PHASES: ReadonlySet<GoLiveLocationPhase> = new Set(["denied", "precise"]);

export function GoLiveLocationSheet() {
  const state = useGoLiveLocationSheet();
  const cancel = () => answerGoLiveLocation("cancel");
  const animationType = useModalAnimation("fade");
  return (
    <Modal visible={state !== null} transparent animationType={animationType} onRequestClose={cancel}>
      <View className="flex-1 items-center justify-center bg-on-media-scrim px-6">
        {state ? (
          <View
            testID={`go-live-location-${state.phase}`}
            accessibilityViewIsModal
            className="w-full max-w-md gap-4 rounded-lg border border-hairline bg-surface-2 p-5"
          >
            <Text accessibilityRole="header" className="font-heading text-title uppercase tracking-caps text-ink">
              {titleFor(state.phase, state.purpose)}
            </Text>
            <Text
              testID="go-live-location-body"
              accessibilityRole={state.phase === "explain" ? undefined : "alert"}
              className="font-body text-callout leading-6 text-ink"
            >
              {state.phase === "precise" ? preciseCopy().body : BODY[state.phase]}
            </Text>
            {state.busy ? (
              <View className="flex-row items-center gap-2" accessibilityLiveRegion="polite">
                <ActivityIndicator accessibilityLabel="Finding your location" />
                <Text className="font-body text-body text-ink-2">Finding your location...</Text>
              </View>
            ) : null}
            <Actions phase={state.phase} busy={state.busy} onCancel={cancel} />
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

function Actions({ phase, busy, onCancel }: { phase: GoLiveLocationPhase; busy: boolean; onCancel: () => void }) {
  if (phase === "explain") {
    return (
      <>
        <Button testID="go-live-location-continue" label="Continue" disabled={busy} onPress={() => answerGoLiveLocation("continue")} />
        <Button variant="ghost" height={44} label="Not now" disabled={busy} onPress={onCancel} />
      </>
    );
  }
  const retry = (
    <Button
      testID="go-live-location-retry"
      variant="secondary"
      label="Retry"
      disabled={busy}
      onPress={() => answerGoLiveLocation("retry")}
    />
  );
  if (SETTINGS_PHASES.has(phase)) {
    return (
      <>
        <Button
          testID="go-live-location-settings"
          variant="secondary"
          label="Open Settings"
          disabled={busy}
          onPress={() => {
            // Leaving for Settings ends this attempt with the sheet's own
            // reason; Retry (or a new Go Live) picks it up on return.
            onCancel();
            void Linking.openSettings();
          }}
        />
        {retry}
        <Button variant="ghost" height={44} label="Not now" disabled={busy} onPress={onCancel} />
      </>
    );
  }
  return (
    <>
      {retry}
      <Button variant="ghost" height={44} label="Not now" disabled={busy} onPress={onCancel} />
    </>
  );
}
