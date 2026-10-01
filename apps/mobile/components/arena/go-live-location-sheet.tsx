/**
 * The Go Live location states (`match_location_required` ON, contract 6):
 * explain before the system prompt, denied with Open Settings, a reading too
 * coarse to use, and no fix in time. Driven by `lib/arena/go-live-location.ts`
 * and mounted once by `<ArenaBootstrap />`. A centered RN Modal; the hardware
 * back / backdrop answer "Not now", which never takes the athlete live.
 */
import { ActivityIndicator, Linking, Modal, Text, View } from "react-native";
import {
  GO_LIVE_ACCURACY_COPY,
  GO_LIVE_LOCATION_DENIED_COPY,
  GO_LIVE_LOCATION_EXPLAIN_COPY,
  LOCATION_UNAVAILABLE_COPY,
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
  unavailable: "No location",
};

const BODY: Record<GoLiveLocationPhase, string> = {
  explain: GO_LIVE_LOCATION_EXPLAIN_COPY,
  denied: GO_LIVE_LOCATION_DENIED_COPY,
  accuracy: GO_LIVE_ACCURACY_COPY,
  unavailable: LOCATION_UNAVAILABLE_COPY,
};

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
              {TITLES[state.phase]}
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
  if (phase === "denied") {
    return (
      <>
        <SecondaryButton
          label="Open Settings"
          onPress={() => {
            onCancel();
            void Linking.openSettings();
          }}
        />
        <TertiaryButton label="Not now" onPress={onCancel} />
      </>
    );
  }
  return (
    <>
      <SecondaryButton label="Retry" disabled={busy} onPress={() => answerGoLiveLocation("retry")} />
      <TertiaryButton label="Not now" disabled={busy} onPress={onCancel} />
    </>
  );
}
