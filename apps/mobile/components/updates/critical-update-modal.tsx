import { Modal, Text, View } from "react-native";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/ui/elo-system";
import { useModalPresentWatchdog } from "@/lib/updates/use-modal-present-watchdog";

export const CRITICAL_UPDATE_DEFAULT_BODY =
  "You just got an app update with critical improvements. Please restart the app to continue.";

interface CriticalUpdateModalProps {
  visible: boolean;
  notice: string | null;
  onRestart: () => void;
  restarting: boolean;
  error: string | null;
}

// Deliberately a no-op: blocks Android back and iOS swipe-to-dismiss.
const blockClose = () => {};

/**
 * Full-screen, non-dismissible restart gate for a critical OTA (jits-5i2w).
 * Not components/ui/dialog.tsx: its backdrop press closes it. The watchdog
 * remounts the Modal until iOS really presents it (see the hook).
 */
export function CriticalUpdateModal({
  visible,
  notice,
  onRestart,
  restarting,
  error,
}: CriticalUpdateModalProps) {
  const { modalKey, onShow } = useModalPresentWatchdog(visible);
  return (
    <Modal
      key={modalKey}
      visible={visible}
      transparent={false}
      animationType="none"
      statusBarTranslucent
      onRequestClose={blockClose}
      onShow={onShow}
    >
      <View
        accessibilityViewIsModal
        className="flex-1 bg-background items-center justify-center px-6"
      >
        <View className="w-full max-w-md items-center gap-4">
          <Wordmark size="sm" />
          <Text className="font-heading text-xl text-foreground text-center">
            Update ready
          </Text>
          <Text className="font-body text-base text-muted-foreground text-center">
            {notice ?? CRITICAL_UPDATE_DEFAULT_BODY}
          </Text>
          <Button
            testID="critical-update-restart"
            size="lg"
            className="w-full mt-2"
            textClassName="font-heading text-[14px] uppercase tracking-caps-l"
            disabled={restarting}
            onPress={onRestart}
          >
            {restarting ? "Restarting..." : "Restart"}
          </Button>
          {error ? (
            <Text
              className="font-body text-sm text-muted-foreground text-center"
              accessibilityLiveRegion="polite"
            >
              {error}
            </Text>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}
