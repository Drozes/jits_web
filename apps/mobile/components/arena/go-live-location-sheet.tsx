/**
 * The Go Live location states (`match_location_required` ON, contract 6):
 * explain before the system prompt, denied with Open Settings and Retry, a
 * reading too coarse to use, Precise Location off (live location fixes 3a),
 * and no fix in time. Driven by `lib/arena/go-live-location.ts` and mounted
 * once by `<ArenaBootstrap />`. A centered RN Modal; the hardware back /
 * backdrop answer "Not now", which never takes the athlete live.
 */
import { ActivityIndicator, Linking, Modal, Text, View } from "react-native";
import {
  GO_LIVE_ACCURACY_COPY,
  GO_LIVE_LOCATION_DENIED_COPY,
  GO_LIVE_LOCATION_EXPLAIN_COPY,
  IMPLAUSIBLE_MOVEMENT_COPY,
  LOCATION_UNAVAILABLE_COPY,
  PRECISE_LOCATION_COPY,
  PRECISE_LOCATION_TITLE,
} from "@jits/shared/utils";
import { CtaButton, SecondaryButton, TertiaryButton } from "@/components/auth/auth-buttons";
import {
  answerGoLiveLocation,
  useGoLiveLocationSheet,
  type GoLiveLocationPhase,
} from "@/lib/arena/go-live-location";

const TITLES: Record<GoLiveLocationPhase, string> = {
  explain: "Location to go live",
  denied: "Location is off",
  accuracy: "Location too rough",
  precise: PRECISE_LOCATION_TITLE,
  unavailable: "No location",
  movement: "Location check",
};

const BODY: Record<GoLiveLocationPhase, string> = {
  explain: GO_LIVE_LOCATION_EXPLAIN_COPY,
  denied: GO_LIVE_LOCATION_DENIED_COPY,
  accuracy: GO_LIVE_ACCURACY_COPY,
  precise: PRECISE_LOCATION_COPY,
  unavailable: LOCATION_UNAVAILABLE_COPY,
  movement: IMPLAUSIBLE_MOVEMENT_COPY,
};

/** The states fixed only in Settings: Open Settings, Retry, Not now. */
const SETTINGS_PHASES: ReadonlySet<GoLiveLocationPhase> = new Set(["denied", "precise"]);

export function GoLiveLocationSheet() {
  const state = useGoLiveLocationSheet();
  const cancel = () => answerGoLiveLocation("cancel");
  return (
    <Modal visible={state !== null} transparent animationType="fade" onRequestClose={cancel}>
      <View className="flex-1 items-center justify-center bg-black/60 px-6">
        {state ? (
          <View
            testID={`go-live-location-${state.phase}`}
            accessibilityViewIsModal
            className="w-full max-w-md gap-4 rounded-lg border border-hairline bg-surface-2 p-5"
          >
            <Text accessibilityRole="header" className="font-heading text-[18px] uppercase text-ink">
              {state.purpose === "arena" && state.phase === "explain" ? "Location to start" : TITLES[state.phase]}
            </Text>
            <Text
              testID="go-live-location-body"
              accessibilityRole={state.phase === "explain" ? undefined : "alert"}
              className="font-body text-[14px] leading-6 text-ink"
            >
              {BODY[state.phase]}
            </Text>
            {state.busy ? (
              <View className="flex-row items-center gap-2" accessibilityLiveRegion="polite">
                <ActivityIndicator accessibilityLabel="Finding your location" />
                <Text className="font-body text-[13px] text-ink-2">Finding your location...</Text>
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
        <CtaButton testID="go-live-location-continue" label="Continue" disabled={busy} onPress={() => answerGoLiveLocation("continue")} />
        <TertiaryButton label="Not now" disabled={busy} onPress={onCancel} />
      </>
    );
  }
  const retry = (
    <SecondaryButton
      testID="go-live-location-retry"
      label="Retry"
      disabled={busy}
      onPress={() => answerGoLiveLocation("retry")}
    />
  );
  if (SETTINGS_PHASES.has(phase)) {
    return (
      <>
        <SecondaryButton
          testID="go-live-location-settings"
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
        <TertiaryButton label="Not now" disabled={busy} onPress={onCancel} />
      </>
    );
  }
  return (
    <>
      {retry}
      <TertiaryButton label="Not now" disabled={busy} onPress={onCancel} />
    </>
  );
}
