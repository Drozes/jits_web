import * as React from "react";
import { Animated, PanResponder, Platform, StyleSheet, View, type AccessibilityActionEvent } from "react-native";
import { VideoView } from "expo-video";
import { Image } from "expo-image";
import { ON_MEDIA } from "@/lib/theme/palette";
import { DIP_MS, type AngleSlotView } from "@/lib/video/multi-angle/use-multi-angle-playback";
import { MULTI_ANGLE_COPY } from "@/lib/video/multi-angle/copy";

/** A horizontal swipe this long (and mostly horizontal) changes angle. */
export const SWIPE_MIN_DX = 60;

/** Next (-1 = previous) angle for a horizontal swipe, or null when it is not one. */
export function swipeDirection(dx: number, dy: number): 1 | -1 | null {
  if (Math.abs(dx) < SWIPE_MIN_DX || Math.abs(dx) < 2 * Math.abs(dy)) return null;
  // Swipe left brings the next angle in from the right (a deck of pages).
  return dx < 0 ? 1 : -1;
}

interface AngleStackProps {
  slots: AngleSlotView[];
  heldFrame: unknown | null;
  dipped: boolean;
  reduceMotion: boolean;
  /** Fewer than two switchable angles: no swipe. */
  canSwipe: boolean;
  onSwipe: (dir: 1 | -1) => void;
}

/**
 * One VideoView per angle player, stacked in the same frame; only the
 * visible angle is opaque (and on top). A switch is an opacity change, so a
 * hot angle cuts in within a frame. On Android the views are TextureViews:
 * stacked SurfaceViews ignore opacity and z-order (a device-test item, see
 * docs/spikes/2026-10-multi-angle-player.md). Over them: the held outgoing
 * frame during a seek-mode switch, the black dip of a clock-only switch,
 * and the horizontal-swipe layer (with "Next angle" / "Previous angle"
 * accessibility actions, so the gesture is never the only route).
 */
export function AngleStack({ slots, heldFrame, dipped, reduceMotion, canSwipe, onSwipe }: AngleStackProps) {
  const dip = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    if (reduceMotion) {
      dip.setValue(dipped ? 1 : 0);
      return;
    }
    // Moment (Motion Rule): one dip per clock-only switch.
    Animated.timing(dip, { toValue: dipped ? 1 : 0, duration: DIP_MS, useNativeDriver: true }).start();
  }, [dipped, reduceMotion, dip]);

  const onSwipeRef = React.useRef(onSwipe);
  onSwipeRef.current = onSwipe;
  const pan = React.useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 12 && Math.abs(g.dx) > 2 * Math.abs(g.dy),
        onPanResponderRelease: (_e, g) => {
          const dir = swipeDirection(g.dx, g.dy);
          if (dir) onSwipeRef.current(dir);
        },
      }),
    [],
  );

  const onAction = (e: AccessibilityActionEvent) => {
    if (e.nativeEvent.actionName === "increment") onSwipe(1);
    else if (e.nativeEvent.actionName === "decrement") onSwipe(-1);
  };

  return (
    <View style={StyleSheet.absoluteFill}>
      {slots.map((s) =>
        s.angleId ? (
          <VideoView
            key={s.index}
            testID={`angle-view-${s.angleId}`}
            player={s.player}
            style={[StyleSheet.absoluteFill, { opacity: s.visible ? 1 : 0, zIndex: s.visible ? 1 : 0 }]}
            contentFit="contain"
            nativeControls={false}
            allowsPictureInPicture={false}
            surfaceType={Platform.OS === "android" ? "textureView" : undefined}
            onFirstFrameRender={s.onFirstFrameRender}
          />
        ) : null,
      )}
      {heldFrame ? (
        <Image
          testID="angle-held-frame"
          source={heldFrame as never}
          contentFit="contain"
          style={[StyleSheet.absoluteFill, { zIndex: 2 }]}
          accessibilityIgnoresInvertColors
        />
      ) : null}
      <Animated.View
        testID="angle-dip"
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { zIndex: 3, backgroundColor: ON_MEDIA.black, opacity: dip }]}
      />
      <View
        testID="angle-swipe-layer"
        style={[StyleSheet.absoluteFill, { zIndex: 4 }]}
        {...(canSwipe ? pan.panHandlers : null)}
        accessible={canSwipe}
        accessibilityRole={canSwipe ? "adjustable" : undefined}
        accessibilityLabel={canSwipe ? MULTI_ANGLE_COPY.videoSurface : undefined}
        accessibilityActions={
          canSwipe
            ? [
                { name: "increment", label: MULTI_ANGLE_COPY.nextAngle },
                { name: "decrement", label: MULTI_ANGLE_COPY.previousAngle },
              ]
            : undefined
        }
        onAccessibilityAction={canSwipe ? onAction : undefined}
      />
    </View>
  );
}
