import * as React from "react";
import { PanResponder, View, type LayoutChangeEvent } from "react-native";
import type { KeyMoment } from "@jits/shared/utils";
import { ON_MEDIA } from "@/lib/theme/palette";

interface SeekBarProps {
  positionS: number;
  durationS: number;
  moments: KeyMoment[];
  onSeek: (seconds: number) => void;
}

function spoken(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m} minute${m === 1 ? "" : "s"} ${s} second${s === 1 ? "" : "s"}`;
}

/**
 * The player's scrubber: track, played fill, a dot per key moment (the
 * finish in green) and the thumb. Tap or drag to seek; VoiceOver adjusts it
 * in 10 s steps. Built on PanResponder (core RN, no native module).
 */
export function SeekBar({ positionS, durationS, moments, onSeek }: SeekBarProps) {
  const [width, setWidth] = React.useState(0);
  const [dragS, setDragS] = React.useState<number | null>(null);
  const live = React.useRef({ width: 0, durationS, onSeek, x0: 0 });
  live.current.width = width;
  live.current.durationS = durationS;
  live.current.onSeek = onSeek;

  const toSeconds = (x: number) => {
    const { width: w, durationS: d } = live.current;
    if (w <= 0 || d <= 0) return 0;
    return Math.min(d, Math.max(0, (x / w) * d));
  };

  const pan = React.useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => {
          live.current.x0 = e.nativeEvent.locationX;
          setDragS(toSeconds(live.current.x0));
        },
        onPanResponderMove: (_e, g) => setDragS(toSeconds(live.current.x0 + g.dx)),
        onPanResponderRelease: (_e, g) => {
          live.current.onSeek(toSeconds(live.current.x0 + g.dx));
          setDragS(null);
        },
        onPanResponderTerminate: () => setDragS(null),
      }),
    // toSeconds reads only the live ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const shown = dragS ?? positionS;
  const frac = durationS > 0 ? Math.min(1, Math.max(0, shown / durationS)) : 0;
  const pct = (t: number) => `${durationS > 0 ? Math.min(100, Math.max(0, (t / durationS) * 100)) : 0}%` as const;

  return (
    <View
      testID="player-seek"
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="Seek"
      accessibilityValue={{ min: 0, max: Math.round(durationS), now: Math.round(shown), text: `${spoken(shown)} of ${spoken(durationS)}` }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(e) => onSeek(Math.min(durationS, Math.max(0, positionS + (e.nativeEvent.actionName === "increment" ? 10 : -10))))}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      // 44 pt touch target around a 3 pt track.
      style={{ height: 44, justifyContent: "center" }}
      {...pan.panHandlers}
    >
      <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: 20, height: 3, backgroundColor: ON_MEDIA.track }} />
      <View pointerEvents="none" style={{ position: "absolute", left: 0, top: 20, height: 3, width: `${frac * 100}%`, backgroundColor: ON_MEDIA.white }} />
      {/* The finish marker is a white square with a ground edge (visible on the
          played and unplayed track alike), told apart by shape: a finish is not a
          gain, so it is never Gain Green (WP2, R3 FR-1). */}
      {moments.map((m, i) => (
        <View
          key={`${m.t}-${i}`}
          pointerEvents="none"
          testID={`seek-marker-${i}`}
          style={
            m.kind === "finish"
              ? { position: "absolute", left: pct(m.t), top: 17.5, width: 8, height: 8, marginLeft: -4, borderRadius: 1, borderWidth: 1, borderColor: ON_MEDIA.ground, backgroundColor: ON_MEDIA.white }
              : { position: "absolute", left: pct(m.t), top: 18, width: 7, height: 7, marginLeft: -3.5, borderRadius: 3.5, backgroundColor: ON_MEDIA.amber }
          }
        />
      ))}
      <View
        pointerEvents="none"
        style={{ position: "absolute", left: `${frac * 100}%`, top: 14, width: 16, height: 16, marginLeft: -8, borderRadius: 8, borderWidth: 3, borderColor: ON_MEDIA.amber, backgroundColor: ON_MEDIA.white }}
      />
    </View>
  );
}
