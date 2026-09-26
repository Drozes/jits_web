/**
 * The live incoming challenge prompt.
 *
 * A bottom sheet rather than a plate in the list: it has to be answerable
 * wherever the athlete happens to be, on any tab, because being live persists
 * across the app. Mounted once, app-wide, by `<ArenaBootstrap />`.
 *
 * It cannot be swiped away. Both exits (Accept, Decline) send the challenger a
 * real answer; a dismissal that sent nothing would leave them waiting on a
 * decision that had already been made. The sheet does close itself when the
 * challenger cancels, which the hook detects from the challenge row's status.
 */
import * as React from "react";
import { Pressable, Text, View } from "react-native";
import { BottomSheetModal, BottomSheetView } from "@gorhom/bottom-sheet";
import { useThemedTokens } from "@/lib/theme/use-theme";
import type { IncomingChallenge } from "@/lib/arena/use-arena-challenge";

interface ChallengePromptSheetProps {
  challenge: IncomingChallenge | null;
  busy: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

export function ChallengePromptSheet({
  challenge,
  busy,
  onAccept,
  onDecline,
}: ChallengePromptSheetProps) {
  const ref = React.useRef<BottomSheetModal | null>(null);
  const tokens = useThemedTokens();

  // Only dismiss a sheet this component presented and that has not closed
  // itself. dismiss() on a gorhom modal that was never presented (this
  // effect's first run, challenge=null, on every launch) leaves it stuck in
  // DISMISSING, and the next present() mounts the portal but never renders
  // it: the FIRST challenge after every launch was invisible. Same fix as
  // `notification-panel.tsx`.
  const presentedRef = React.useRef(false);
  React.useEffect(() => {
    if (challenge) {
      ref.current?.present();
      presentedRef.current = true;
    } else if (presentedRef.current) {
      ref.current?.dismiss();
      presentedRef.current = false;
    }
  }, [challenge]);

  const handleChange = React.useCallback((index: number) => {
    if (index === -1) presentedRef.current = false;
  }, []);

  const meta = challenge
    ? [
        challenge.challengerElo != null ? `ELO ${challenge.challengerElo}` : null,
        challenge.challengerWeight != null
          ? `${challenge.challengerWeight} lbs`
          : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  return (
    <BottomSheetModal
      ref={ref}
      // Sized to its content (gorhom v5 dynamic sizing over a BottomSheetView)
      // rather than a percentage snap point: the prompt is a fixed, short
      // block, and a percentage either clips it on an SE or leaves dead
      // space on a Pro Max.
      enableDynamicSizing
      enablePanDownToClose={false}
      onChange={handleChange}
      backgroundStyle={{ backgroundColor: tokens.bgSecondary }}
      handleIndicatorStyle={{ backgroundColor: tokens.textTertiary }}
    >
      <BottomSheetView>
        {challenge ? (
          <View testID="challenge-prompt" className="px-4 pb-8 pt-2">
            <Text className="font-mono-bold text-[10px] text-ink-2 uppercase tracking-caps-xl">
              Incoming challenge
            </Text>
            <Text className="mt-2 font-heading text-[20px] text-ink">
              {challenge.challengerName} wants to roll
            </Text>
            {meta ? (
              <Text
                className="mt-1 font-mono text-[12px] text-ink-2"
                style={{ fontVariant: ["tabular-nums"] }}
              >
                {meta}
              </Text>
            ) : null}
            <Text className="mt-2 font-body text-[13px] text-ink-2">
              Accept and you both drop straight into the match.
            </Text>

            <View className="mt-5 flex-row gap-2">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Decline challenge"
                accessibilityState={{ disabled: busy }}
                onPress={onDecline}
                disabled={busy}
                className="min-h-[44px] flex-1 items-center justify-center rounded-sm border border-hairline-strong active:bg-surface-4"
                style={busy ? { opacity: 0.6 } : undefined}
              >
                <Text className="font-heading text-[12px] text-ink-2 uppercase tracking-caps">
                  Decline
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Accept challenge"
                accessibilityState={{ disabled: busy }}
                onPress={onAccept}
                disabled={busy}
                className="min-h-[44px] flex-1 items-center justify-center rounded-sm bg-cta active:bg-cta-hover"
                style={busy ? { opacity: 0.6 } : undefined}
              >
                <Text className="font-heading text-[12px] text-ink-on-cta uppercase tracking-caps">
                  Accept
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </BottomSheetView>
    </BottomSheetModal>
  );
}
