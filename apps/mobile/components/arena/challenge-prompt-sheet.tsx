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
import {
  BottomSheetModal,
  BottomSheetView,
  type BottomSheetBackgroundProps,
} from "@gorhom/bottom-sheet";
import * as Haptics from "expo-haptics";
import type { IncomingChallenge } from "@/lib/arena/use-arena-challenge";
import { useViewerStakes } from "@/lib/match-flow/use-viewer-stakes";
import { FIGHT_RADIUS } from "@/components/match-flow/fight/fight-tokens";
import { usePalette } from "@/lib/theme/palette";
import { InitialsBlock, KindTag, Mono, StakesStrip, shortName } from "@/components/match-flow/fight/fight-ui";

/**
 * The sheet's background, WITHOUT gorhom's default accessibility. The stock
 * `BottomSheetBackground` is an `accessible` element labelled "Bottom Sheet"
 * with role "adjustable": a meaningless stop for VoiceOver on a sheet that
 * cannot be dragged. Purely visual here. The stock one also rounds to 15px;
 * the brand cap for modals is 8px.
 */
function PromptBackground({ style, pointerEvents }: BottomSheetBackgroundProps) {
  return (
    <View
      pointerEvents={pointerEvents}
      accessible={false}
      importantForAccessibility="no"
      style={[style, { borderTopLeftRadius: 8, borderTopRightRadius: 8 }]}
    />
  );
}

interface ChallengePromptSheetProps {
  challenge: IncomingChallenge | null;
  busy: boolean;
  onAccept: () => void;
  onDecline: () => void;
  /**
   * The viewer's own rating and weight, for the stakes strip. Omitted (or a
   * missing rating): no strip. Arena challenges are ranked-only.
   */
  viewer?: { elo: number | null; weight: number | null };
}

export function ChallengePromptSheet({
  challenge,
  busy,
  onAccept,
  onDecline,
  viewer,
}: ChallengePromptSheetProps) {
  const ref = React.useRef<BottomSheetModal | null>(null);
  const p = usePalette();
  // One calculate_elo_stakes read per challenge, viewer as "challenger"
  // (see useViewerStakes). Fails quietly: no strip.
  const stakes = useViewerStakes(
    !!challenge && viewer?.elo != null,
    viewer?.elo,
    challenge?.challengerElo,
    viewer?.weight,
    challenge?.challengerWeight,
  );

  // Only dismiss a sheet this component presented and that has not closed
  // itself. dismiss() on a gorhom modal that was never presented (this
  // effect's first run, challenge=null, on every launch) leaves it stuck in
  // DISMISSING, and the next present() mounts the portal but never renders
  // it: the FIRST challenge after every launch was invisible. Same fix as
  // `notification-panel.tsx`.
  const presentedRef = React.useRef(false);
  // The prompt can appear on any tab, so it buzzes once per challenge (a
  // Warning notification: it wants an answer). Keyed by id so a re-render
  // with the same challenge never buzzes twice.
  const buzzedIdRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (challenge) {
      ref.current?.present();
      presentedRef.current = true;
      if (buzzedIdRef.current !== challenge.challengeId) {
        buzzedIdRef.current = challenge.challengeId;
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(
          () => undefined,
        );
      }
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
          ? `${challenge.challengerWeight} LBS`
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
      // ACCESSIBILITY (jits-ef2a). gorhom defaults the sheet's content
      // container to `accessible` with the label "Bottom Sheet", and an
      // accessible element is a LEAF to VoiceOver and to idb: everything
      // inside it, including Accept and Decline, collapsed into one opaque
      // "Bottom Sheet" stop. Turning that off exposes the real elements.
      accessible={false}
      backgroundComponent={PromptBackground}
      // Follows the app theme: the theme's plate (the same light value as the
      // shared Sheet's card token), with the plates inside on the page color.
      backgroundStyle={{ backgroundColor: p.plate, borderTopWidth: 1, borderColor: p.strong }}
      handleIndicatorStyle={{ backgroundColor: p.strong, width: 40 }}
    >
      <BottomSheetView>
        {challenge ? (
          <View
            testID="challenge-prompt"
            style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 34, gap: 20 }}
            // The prompt demands an answer: keep VoiceOver focus inside it
            // rather than wandering to the screen behind the sheet.
            accessibilityViewIsModal
          >
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: p.win }} />
                <Mono bold color={p.win}>
                  INCOMING CHALLENGE
                </Mono>
              </View>
              <KindTag kind="ranked" />
            </View>

            <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
              <InitialsBlock name={challenge.challengerName} size={88} fontSize={30} />
              <View style={{ flex: 1, gap: 8, minWidth: 0 }}>
                <Text numberOfLines={1} className="font-display" style={{ fontSize: 44, lineHeight: 42, color: p.text }}>
                  {shortName(challenge.challengerName)}
                </Text>
                {meta ? (
                  <Text className="font-mono" style={{ fontSize: 13, color: p.text2, fontVariant: ["tabular-nums"] }}>
                    {meta}
                  </Text>
                ) : null}
                <Text className="font-body" style={{ fontSize: 13, color: p.text2 }}>
                  {`${shortName(challenge.challengerName)} is live in the Arena`}
                </Text>
              </View>
            </View>

            {stakes ? (
              <View style={{ gap: 8 }}>
                <Mono color={p.text3}>{`YOUR STAKES${viewer?.elo != null ? ` \u00b7 ${viewer.elo}` : ""}`}</Mono>
                <StakesStrip
                  testID="challenge-prompt-stakes"
                  win={stakes.challenger_win}
                  draw={stakes.challenger_draw}
                  loss={stakes.challenger_loss}
                  height={64}
                  background={p.bg}
                />
              </View>
            ) : (
              <Text className="font-body" style={{ fontSize: 13, color: p.text2 }}>
                Accept and you both drop straight into the match.
              </Text>
            )}

            <View style={{ flexDirection: "row", gap: 12 }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Decline challenge"
                accessibilityState={{ disabled: busy }}
                onPress={onDecline}
                disabled={busy}
                style={({ pressed }) => ({
                  flex: 1,
                  height: 56,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: FIGHT_RADIUS.button,
                  borderWidth: 1,
                  borderColor: p.strong,
                  backgroundColor: pressed ? p.secondaryBgPressed : p.secondaryBg,
                  opacity: busy ? 0.6 : 1,
                })}
              >
                <Text className="font-heading uppercase" style={{ fontSize: 14, letterSpacing: 1.12, color: p.text }}>
                  Decline
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Accept challenge"
                accessibilityState={{ disabled: busy }}
                onPress={onAccept}
                disabled={busy}
                style={({ pressed }) => ({
                  flex: 1.6,
                  height: 56,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: FIGHT_RADIUS.button,
                  backgroundColor: pressed ? p.ctaPressed : p.cta,
                  opacity: busy ? 0.6 : 1,
                })}
              >
                <Text className="font-heading uppercase" style={{ fontSize: 14, letterSpacing: 1.12, color: p.onCta }}>
                  Accept challenge
                </Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </BottomSheetView>
    </BottomSheetModal>
  );
}
