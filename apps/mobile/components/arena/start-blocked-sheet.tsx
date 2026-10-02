/**
 * An Arena accept the proximity gate refused (`match_location_required` on,
 * `proximity_required` / `proximity_failed`): a title that matches the reason
 * ("Location needed", "Waiting for ALEX", "Not on the same mat") over the
 * message, with Retry and Cancel. The challenge stays `accepted`
 * until one of them answers, so neither athlete is stranded: Retry sends a
 * fresh reading and starts it, Cancel withdraws it (the challenger's plate
 * then clears). Not dismissable by back or backdrop, like the prompt. A
 * centered alert by design (DESIGN.md, "Inputs and overlays"): it blocks
 * until answered, so it is not a bottom sheet. Fades in, or appears in place
 * under Reduce Motion.
 */
import { Modal, Text, View } from "react-native";
import { Button } from "@/components/ui/elo-system/button";
import type { StartBlocked } from "@/lib/arena/use-arena-challenge";
import { useModalAnimation } from "@/lib/motion";

export function StartBlockedSheet({
  blocked,
  busy,
  onRetry,
  onCancel,
}: {
  blocked: StartBlocked | null;
  busy: boolean;
  onRetry: () => void;
  onCancel: () => void;
}) {
  const animationType = useModalAnimation("fade");
  return (
    <Modal visible={blocked !== null} transparent animationType={animationType} onRequestClose={() => undefined}>
      <View className="flex-1 items-center justify-center bg-on-media-scrim px-6">
        {blocked ? (
          <View
            testID="arena-start-blocked"
            accessibilityViewIsModal
            className="w-full max-w-md gap-4 rounded-lg border border-hairline bg-surface-2 p-5"
          >
            <Text
              testID="arena-start-blocked-title"
              accessibilityRole="header"
              className="font-heading text-title uppercase tracking-caps text-ink"
            >
              {blocked.title}
            </Text>
            <Text
              testID="arena-start-blocked-message"
              accessibilityRole="alert"
              className="font-body text-callout leading-6 text-ink"
            >
              {blocked.message}
            </Text>
            <Button testID="arena-start-blocked-retry" label="Retry" disabled={busy} onPress={onRetry} />
            <Button variant="secondary" label="Cancel challenge" disabled={busy} onPress={onCancel} />
          </View>
        ) : null}
      </View>
    </Modal>
  );
}
