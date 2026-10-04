/**
 * "Still on the same mat?" (jr_be 016 addendum 4.4; UX 019, 3k, C4): the
 * drift check's prompt, behind `live_location_drift_check` (seeded OFF).
 * A gorhom bottom sheet with the shared chrome (`useSheetChrome`, Reduce
 * Motion: appears in place), not the centered location dialog: it is
 * non-blocking, so a backdrop tap or a swipe down closes it and the athlete
 * stays live on the old tag. It waits until nothing else is up (the
 * incoming challenge prompt, a location sheet, the live menu, a match) and
 * the app is active. Driven by `lib/arena/use-live-drift-check.ts`.
 */
import * as React from "react";
import { AccessibilityInfo, AppState, Text, View, findNodeHandle } from "react-native";
import { BottomSheetModal, BottomSheetView, type BottomSheetBackdropProps } from "@gorhom/bottom-sheet";
import { DRIFT_PROMPT_BODY, DRIFT_PROMPT_TITLE } from "@jits/shared/utils";
import { Button } from "@/components/ui/elo-system/button";
import { SheetBackdrop, useSheetChrome } from "@/components/ui/sheet";
import { useGoLiveLocationSheet } from "@/lib/arena/go-live-location";
import { useLiveMenuOpen } from "@/lib/arena/arena-store";
import { answerDriftPrompt, useDriftPrompt } from "@/lib/arena/use-live-drift-check";

export const DRIFT_SHEET_TEST_ID = "drift-prompt-sheet";

/**
 * Mounts the gorhom modal only while a prompt exists (and through its close),
 * so with the flag off nothing is mounted at all.
 */
export function DriftPromptSheet({ blocked }: { blocked: boolean }) {
  const prompt = useDriftPrompt();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    if (prompt) setMounted(true);
  }, [prompt]);
  const onClosed = React.useCallback(() => setMounted(false), []);
  if (!prompt && !mounted) return null;
  return <DriftPromptModal blocked={blocked} onClosed={onClosed} />;
}

function DriftPromptModal({ blocked, onClosed }: { blocked: boolean; onClosed: () => void }) {
  const prompt = useDriftPrompt();
  const locationSheet = useGoLiveLocationSheet();
  const menuOpen = useLiveMenuOpen();
  const show = !!prompt && !blocked && !locationSheet && !menuOpen && AppState.currentState === "active";
  const busy = prompt?.busy ?? false;
  const ref = React.useRef<BottomSheetModal | null>(null);
  const presentedRef = React.useRef(false);
  const titleRef = React.useRef<Text | null>(null);
  const chrome = useSheetChrome();

  // Only dismiss() a sheet this component presented that has not closed
  // itself (notification-panel.tsx), or gorhom sticks in DISMISSING.
  const hasPrompt = !!prompt;
  React.useEffect(() => {
    if (show) {
      if (presentedRef.current) return;
      ref.current?.present();
      presentedRef.current = true;
      // VoiceOver focus to the title on open (UX 019, 3k step 7).
      const node = titleRef.current ? findNodeHandle(titleRef.current) : null;
      if (node) setTimeout(() => AccessibilityInfo.setAccessibilityFocus(node), 300);
    } else if (presentedRef.current) {
      presentedRef.current = false;
      ref.current?.dismiss();
    } else if (!hasPrompt) {
      // Never shown (it waited, then was dropped): nothing to close.
      onClosed();
    }
  }, [show, hasPrompt, onClosed]);

  const onChange = React.useCallback(
    (index: number) => {
      if (index !== -1) return;
      if (presentedRef.current) {
        presentedRef.current = false;
        // Swiped down or the backdrop: closed without a choice.
        void answerDriftPrompt("dismiss");
      }
      onClosed();
    },
    [onClosed],
  );

  const renderBackdrop = React.useCallback(
    (props: BottomSheetBackdropProps) => <SheetBackdrop {...props} pressBehavior={busy ? "none" : "close"} />,
    [busy],
  );

  return (
    <BottomSheetModal
      ref={ref}
      enableDynamicSizing
      enablePanDownToClose={!busy}
      onChange={onChange}
      accessible={false}
      backdropComponent={renderBackdrop}
      {...chrome}
    >
      <BottomSheetView>
        <View testID={DRIFT_SHEET_TEST_ID} className="gap-4 px-5 pb-8 pt-2">
          <Text
            ref={titleRef}
            accessibilityRole="header"
            className="font-heading text-title uppercase tracking-caps text-ink"
          >
            {DRIFT_PROMPT_TITLE}
          </Text>
          <Text className="font-body text-callout leading-6 text-ink">{DRIFT_PROMPT_BODY}</Text>
          <Button
            testID="drift-prompt-update"
            label="Update"
            busy={busy}
            disabled={busy}
            onPress={() => void answerDriftPrompt("update")}
          />
          <Button
            testID="drift-prompt-offline"
            variant="secondary"
            label="Go offline"
            accessibilityLabel="Drift prompt: Go offline"
            disabled={busy}
            onPress={() => void answerDriftPrompt("offline")}
          />
        </View>
      </BottomSheetView>
    </BottomSheetModal>
  );
}
