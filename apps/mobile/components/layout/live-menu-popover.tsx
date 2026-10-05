/**
 * The live chip's popover (spec 4.4, AC-H6): `[Open Arena]` and
 * `[Go offline]`, plus one line saying what the app already does while live.
 * Going offline from a header is therefore two taps (chip, then this).
 *
 * Radius 4, no shadow (a surface tier shift plus a hairline), no animation,
 * and a tap anywhere outside dismisses it.
 *
 * The buttons read `Open Arena` / `Go offline` on screen, but their
 * accessibility labels are prefixed (`Live menu: ...`) so they never collide
 * with the Arena toggle's exact `Go offline`, which the match-loop harness
 * taps by label.
 */
import * as React from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCanGoOffline, useRegisterLiveMenuOpen } from "@/lib/arena/arena-store";
import { ARENA_HREF } from "@/lib/arena/constants";
import { goOfflineWithFeedback } from "@/lib/arena/go-live-feedback";
import { cn } from "@/lib/cn";

export const LIVE_MENU_COPY =
  "Leaving the app takes you offline. Your screen stays on while you're live.";

/** The header bar's height below the safe area (`BrandHeader`, `AppHeader`). */
const HEADER_BAR_HEIGHT = 56;

interface LiveMenuPopoverProps {
  visible: boolean;
  onClose: () => void;
}

export function LiveMenuPopover({ visible, onClose }: LiveMenuPopoverProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // Always, with an owner mounted: the choice is recorded at once (round 3).
  const canGoOffline = useCanGoOffline();
  const locked = !canGoOffline;
  // The drift prompt waits while this menu is up.
  useRegisterLiveMenuOpen(visible);

  const openArena = () => {
    onClose();
    router.navigate(ARENA_HREF);
  };

  const goOffline = () => {
    if (locked) return;
    onClose();
    // Guarded (shares the chip's and the toggle's 2s cooldown) and MANUAL,
    // so a challenge tucked into the chip is dropped without a decline (Q3).
    // A failed flag clear is said once, neutrally, the same way as from the
    // Arena's control bar (`goOfflineWithFeedback`).
    void goOfflineWithFeedback();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      // Lay out from the top of the screen on Android too (the app is
      // edge-to-edge), so `insets.top` means the same thing here as in the
      // header and the menu lands just under the chip.
      statusBarTranslucent
      navigationBarTranslucent
      supportedOrientations={["portrait", "landscape"]}
    >
      <Pressable
        testID="live-menu-backdrop"
        accessibilityRole="button"
        accessibilityLabel="Close live menu"
        onPress={onClose}
        style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0 }}
      />
      <View
        testID="live-menu"
        className="absolute rounded-md border border-hairline bg-surface-3 p-3"
        style={{
          top: insets.top + HEADER_BAR_HEIGHT + 4,
          right: Math.max(16, insets.right),
          width: 264,
          gap: 12,
        }}
      >
        <Text maxFontSizeMultiplier={1.3} className="font-body text-body leading-[18px] text-ink-2">
          {LIVE_MENU_COPY}
        </Text>
        <View className="flex-row" style={{ gap: 8 }}>
          <MenuButton label="Open Arena" a11y="Live menu: open Arena" onPress={openArena} />
          <MenuButton
            label="Go offline"
            a11y="Live menu: go offline"
            onPress={goOffline}
            disabled={locked}
          />
        </View>
      </View>
    </Modal>
  );
}

function MenuButton({
  label,
  a11y,
  onPress,
  disabled = false,
}: {
  label: string;
  a11y: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className={cn(
        "h-11 flex-1 items-center justify-center rounded-sm border border-hairline-strong active:bg-surface-4",
        disabled && "opacity-50",
      )}
    >
      <Text
        maxFontSizeMultiplier={1.3}
        numberOfLines={1}
        className="font-heading text-small uppercase tracking-caps-l text-ink"
      >
        {label}
      </Text>
    </Pressable>
  );
}
