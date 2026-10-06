import * as React from "react";
import { Image, Platform, StyleSheet, View } from "react-native";
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from "react-native-reanimated";
import { VideoView, type VideoPlayer } from "expo-video";
import type { SwitchState } from "@/lib/match-detail/use-video-playback";
import { duration, easing, moment } from "@/lib/motion";
import { ON_MEDIA } from "@/lib/theme/palette";

type Slot = 0 | 1;

export interface AngleViewStackProps {
  players: readonly [VideoPlayer, VideoPlayer];
  frontSlot: Slot;
  switchState: Pick<SwitchState, "phase" | "seq" | "mode" | "fromSlot" | "incomingSlot" | "approximate">;
  onSlotFirstFrame: (slot: Slot) => void;
  posterUrl: string | null;
  frameShown: boolean;
  /** From useReduceMotion() at the screen (a prop for testability). */
  reduceMotion: boolean;
}

/** How the outgoing view leaves at a keep-watching landing (Motion registry: Angle crossfade, Angle dip). */
export type AngleTransition = "none" | "crossfade" | "dip" | "cut";

/** A keep-watching landing with its outgoing slot known, else null. */
function landingFrom(s: AngleViewStackProps["switchState"]): Slot | null {
  return s.phase === "landing" && s.mode === "keep_watching" && s.fromSlot != null ? s.fromSlot : null;
}

/**
 * The view on top (contract 07 section 2.2): the outgoing angle's slot while
 * a keep-watching switch lands (it fades out over the incoming one), else
 * the front slot.
 */
export function topSlotOf(frontSlot: Slot, s: AngleViewStackProps["switchState"]): Slot {
  return landingFrom(s) ?? frontSlot;
}

/** The landing transition: Reduce Motion cuts, an approximate angle dips, an exact one crossfades. */
export function angleTransitionOf(s: AngleViewStackProps["switchState"], reduceMotion: boolean): AngleTransition {
  if (landingFrom(s) == null) return "none";
  if (reduceMotion) return "cut";
  return s.approximate ? "dip" : "crossfade";
}

/**
 * The player's picture (jits-xfvd.19): one `VideoView` per slot player,
 * stacked in the same frame and bound to its player for the screen's life
 * (a player never moves between views). On Android both are TextureViews,
 * set at mount: stacked SurfaceViews ignore opacity and z-order.
 *
 * The top view is the front slot, except while a keep-watching switch lands:
 * then it is the outgoing angle (still live and playing) over the incoming
 * one, and it leaves:
 * - exact-synced: it fades 1 to 0 over `duration.fast` on the brand ease-out
 *   (Angle crossfade), revealing the incoming angle already in step beneath;
 * - approximate: black fades in over `moment.angleDip`, the outgoing view
 *   goes at the bottom, black fades out over the same (Angle dip);
 * - Reduce Motion: a cut, it goes at once.
 * The view underneath always stays at full opacity (a transparent one may be
 * throttled on iOS). At idle the new front is on top at full opacity again.
 * An in_place switch draws only the front (`SwitchOverlay` holds its still).
 *
 * The poster covers the front slot until its item draws a frame. With one
 * player for both slots (no second player), only the front view is drawn.
 * Not touchable; screen readers skip the picture as before.
 */
export function AngleViewStack({ players, frontSlot, switchState, onSlotFirstFrame, posterUrl, frameShown, reduceMotion }: AngleViewStackProps) {
  const { seq } = switchState;
  const top = topSlotOf(frontSlot, switchState);
  const transition = angleTransitionOf(switchState, reduceMotion);
  const from = landingFrom(switchState);
  const shared = players[0] === players[1];

  const opacity0 = useSharedValue(1);
  const opacity1 = useSharedValue(1);
  const black = useSharedValue(0);

  // One run per transition of one switch: a re-render mid-landing never restarts it.
  const appliedRef = React.useRef("");
  React.useEffect(() => {
    const key = `${transition}:${from}:${seq}`;
    if (appliedRef.current === key) return;
    appliedRef.current = key;
    const outgoing = from === 0 ? opacity0 : from === 1 ? opacity1 : null;
    if (transition === "none" || !outgoing) {
      // Idle or pending: both views at full opacity, no dip.
      cancelAnimation(opacity0);
      cancelAnimation(opacity1);
      cancelAnimation(black);
      opacity0.value = 1;
      opacity1.value = 1;
      black.value = 0;
      return;
    }
    if (transition === "cut") {
      outgoing.value = 0;
    } else if (transition === "crossfade") {
      outgoing.value = withTiming(0, { duration: duration.fast, easing: easing.brandOut });
    } else {
      black.value = withSequence(
        withTiming(1, { duration: moment.angleDip, easing: easing.linear }),
        withTiming(0, { duration: moment.angleDip, easing: easing.linear }),
      );
      // The outgoing angle goes while the frame is black.
      outgoing.value = withDelay(moment.angleDip, withTiming(0, { duration: 0 }));
    }
  }, [transition, from, seq, opacity0, opacity1, black]);

  const style0 = useAnimatedStyle(() => ({ opacity: opacity0.value }));
  const style1 = useAnimatedStyle(() => ({ opacity: opacity1.value }));
  const blackStyle = useAnimatedStyle(() => ({ opacity: black.value }));

  const onFirst0 = React.useCallback(() => onSlotFirstFrame(0), [onSlotFirstFrame]);
  const onFirst1 = React.useCallback(() => onSlotFirstFrame(1), [onSlotFirstFrame]);

  const slots: Slot[] = shared ? [frontSlot] : [0, 1];
  return (
    <View testID="angle-view-stack" pointerEvents="none" style={StyleSheet.absoluteFill}>
      {slots.map((slot) => (
        <Animated.View
          key={slot}
          testID={`angle-view-slot-${slot}`}
          style={[StyleSheet.absoluteFill, { zIndex: slot === top ? 1 : 0 }, slot === 0 ? style0 : style1]}
        >
          <VideoView
            // The front view keeps the id the player has always had.
            testID={slot === frontSlot ? "video-player" : "video-player-incoming"}
            player={players[slot]}
            style={StyleSheet.absoluteFill}
            contentFit="contain"
            nativeControls={false}
            allowsPictureInPicture={false}
            surfaceType={Platform.OS === "android" ? "textureView" : undefined}
            onFirstFrameRender={slot === 0 ? onFirst0 : onFirst1}
          />
        </Animated.View>
      ))}
      {transition === "dip" ? (
        <Animated.View testID="angle-view-dip" style={[StyleSheet.absoluteFill, { zIndex: 2, backgroundColor: ON_MEDIA.black }, blackStyle]} />
      ) : null}
      {posterUrl && !frameShown ? (
        <Image
          testID="video-poster"
          source={{ uri: posterUrl }}
          resizeMode="contain"
          style={[StyleSheet.absoluteFill, { zIndex: 3 }]}
          accessibilityIgnoresInvertColors
        />
      ) : null}
    </View>
  );
}
