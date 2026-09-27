import * as React from "react";
import { PanResponder, View, type LayoutChangeEvent } from "react-native";
import type { KeyMoment } from "@jits/shared/utils";
import { FILM } from "@/lib/film-room/film-palette";

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
      style={{ height: 32, justifyContent: "center" }}
      {...pan.panHandlers}
    >
      <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: 14, height: 3, backgroundColor: "rgba(255,255,255,0.25)" }} />
      <View pointerEvents="none" style={{ position: "absolute", left: 0, top: 14, height: 3, width: `${frac * 100}%`, backgroundColor: FILM.white }} />
      {moments.map((m, i) => (
        <View
          key={`${m.t}-${i}`}
          pointerEvents="none"
          testID={`seek-marker-${i}`}
          style={{ position: "absolute", left: pct(m.t), top: 12, width: 7, height: 7, marginLeft: -3.5, borderRadius: 3.5, backgroundColor: m.kind === "finish" ? FILM.win : FILM.amber }}
        />
      ))}
      <View
        pointerEvents="none"
        style={{ position: "absolute", left: `${frac * 100}%`, top: 8, width: 16, height: 16, marginLeft: -8, borderRadius: 8, borderWidth: 3, borderColor: FILM.amber, backgroundColor: FILM.white }}
      />
    </View>
  );
}
