import * as React from "react";
import { Pressable, Text, View } from "react-native";
import { Pause, Play, RotateCcw, RotateCw } from "lucide-react-native";
import { ON_MEDIA } from "@/lib/theme/palette";
import { TABULAR, typeStep } from "@/lib/typography";

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
