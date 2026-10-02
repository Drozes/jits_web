import * as React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { StatePressable } from "@/components/ui/state-pressable";
import { Pause, Play, RotateCcw, RotateCw } from "lucide-react-native";
import { formatClock, type KeyMoment } from "@jits/shared/utils";
import { ON_MEDIA } from "@/lib/theme/palette";
import { TABULAR, TRACKING, typeStep } from "@/lib/typography";

/** Playback speeds the speed button cycles through (slow motion for study). */
export const SPEEDS = [1, 0.5, 0.25, 2] as const;

export function nextSpeed(current: number): number {
  const i = SPEEDS.indexOf(current as (typeof SPEEDS)[number]);
  return SPEEDS[(i + 1) % SPEEDS.length];
}

function SkipButton({ dir, onPress }: { dir: "back" | "forward"; onPress: () => void }) {
  const Icon = dir === "back" ? RotateCcw : RotateCw;
  return (
    <Pressable
      testID={`player-skip-${dir}`}
      accessibilityRole="button"
      accessibilityLabel={dir === "back" ? "Back 10 seconds" : "Forward 10 seconds"}
      onPress={onPress}
      className="items-center justify-center active:opacity-70"
      style={{ width: 56, height: 56 }}
    >
      <Icon size={28} color={ON_MEDIA.white} strokeWidth={2} />
      {/* The "10" sits in the icon's open center: a full-box centered layer so
          the 10px floor glyph (was 8px at top: 23) stays centered on the icon. */}
      <View pointerEvents="none" style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>
        <Text className="font-mono-bold" style={[typeStep("micro"), { color: ON_MEDIA.white, textAlign: "center" }, TABULAR]}>
          10
        </Text>
      </View>
    </Pressable>
  );
}

interface TransportProps {
  playing: boolean;
  speed: number;
  onToggle: () => void;
  onSkip: (delta: number) => void;
  onSpeed: () => void;
}

/** −10 s, play/pause, +10 s, speed. */
export function Transport({ playing, speed, onToggle, onSkip, onSpeed }: TransportProps) {
  return (
    <View className="flex-row items-center justify-between">
      <SkipButton dir="back" onPress={() => onSkip(-10)} />
      <Pressable
        testID="player-toggle"
        accessibilityRole="button"
        accessibilityLabel={playing ? "Pause" : "Play"}
        onPress={onToggle}
        className="items-center justify-center active:opacity-80"
        style={{ width: 72, height: 72, borderRadius: 36, borderWidth: 1, borderColor: ON_MEDIA.strong, backgroundColor: ON_MEDIA.glassStrong }}
      >
        {playing ? (
          <Pause size={28} color={ON_MEDIA.white} fill={ON_MEDIA.white} />
        ) : (
          <View style={{ marginLeft: 4 }}>
            <Play size={28} color={ON_MEDIA.white} fill={ON_MEDIA.white} />
          </View>
        )}
      </Pressable>
      <SkipButton dir="forward" onPress={() => onSkip(10)} />
      <Pressable
        testID="player-speed"
        accessibilityRole="button"
        accessibilityLabel={`Playback speed, ${speed}x`}
        onPress={onSpeed}
        className="items-center justify-center active:opacity-70"
        style={{ height: 44, minWidth: 56, paddingHorizontal: 12, borderRadius: 3, borderWidth: 1, borderColor: ON_MEDIA.strong, backgroundColor: ON_MEDIA.glass }}
      >
        <Text className="font-mono-bold" style={[typeStep("body"), { color: ON_MEDIA.white }, TABULAR]}>
          {`${speed}x`}
        </Text>
      </Pressable>
    </View>
  );
}

/** Horizontally scrolling "00:27 SINGLE LEG" chips; the current one is lit. */
export function MomentChips({ moments, currentT, onJump }: { moments: KeyMoment[]; currentT: number | null; onJump: (t: number) => void }) {
  if (moments.length === 0) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      accessibilityLabel="Key moments"
      contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}
      style={{ marginHorizontal: -16 }}
    >
      {moments.map((m, i) => {
        const on = currentT === m.t;
        const label = `${formatClock(m.t)} ${m.label.toUpperCase()}${m.kind === "finish" ? " · FINISH" : ""}`;
        return (
          <StatePressable
            dim
            key={`${m.t}-${i}`}
            testID={`moment-chip-${i}`}
            accessibilityRole="button"
            accessibilityLabel={`Jump to ${formatClock(m.t)}, ${m.label}`}
            accessibilityState={{ selected: on }}
            onPress={() => onJump(m.t)}
            style={{ height: 44, paddingHorizontal: 12, borderRadius: 2, borderWidth: 1, justifyContent: "center", borderColor: on ? ON_MEDIA.text : ON_MEDIA.strong, backgroundColor: on ? ON_MEDIA.text : ON_MEDIA.tag }}
          >
            <Text className="font-mono-bold" style={[typeStep("caption"), { letterSpacing: TRACKING.caps, color: on ? ON_MEDIA.ink : ON_MEDIA.white }, TABULAR]}>
              {label}
            </Text>
          </StatePressable>
        );
      })}
    </ScrollView>
  );
}

/** The light caption chip: "03:12 | Guard pass: knee cut to side control". */
export function MomentCaption({ t, text }: { t: number; text: string }) {
  return (
    <View testID="player-caption" className="flex-row items-center self-start" style={{ gap: 8, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 2, backgroundColor: ON_MEDIA.chip, maxWidth: "100%" }}>
      <Text className="font-mono-bold" style={[typeStep("caption"), { color: ON_MEDIA.ink }, TABULAR]}>
        {formatClock(t)}
      </Text>
      <View style={{ width: 1, height: 12, backgroundColor: ON_MEDIA.chipBorder }} />
      <Text numberOfLines={2} className="font-body-medium flex-shrink" style={[typeStep("body"), { lineHeight: 16, color: ON_MEDIA.ink }]}>
        {text}
      </Text>
    </View>
  );
}
