import * as React from "react";
import { Text, View } from "react-native";
import { Audio, ResizeMode, Video } from "expo-av";
import { Plate } from "@/components/ui/elo-system";
import { useMatchRecorder } from "@/components/match-flow/match-recorder-context";
import type { BroadcastResult } from "@jits/shared/hooks/use-session-match-sync";
import {
  PRACTICE_SUMMARY_TIP_CLIP,
  PRACTICE_SUMMARY_TIP_NO_CLIP,
  PRACTICE_SUMMARY_TIP_NO_CLIP_GRANTED,
} from "@/lib/practice/constants";
import { PracticeButton, PracticeTip } from "./practice-steps";

function verdict(result: BroadcastResult | null, athleteId: string): string {
  if (!result || result.result === "draw") return "DRAW";
  return result.winnerId === athleteId ? "YOU WON" : "YOU LOST";
}

/**
 * The end of the practice run. No rating number, no share, no rematch, no
 * match details. The clip (if any) plays from the local file and is deleted
 * when the athlete leaves; see `PracticeClipCustodian`.
 */
export function PracticeSummary({
  result,
  athleteId,
  onArena,
  onDone,
  onAgain,
}: {
  result: BroadcastResult | null;
  athleteId: string;
  onArena: () => void;
  onDone: () => void;
  onAgain: () => void;
}) {
  const { localUri, permission } = useMatchRecorder();
  const [watching, setWatching] = React.useState(false);

  React.useEffect(() => {
    if (!watching) return;
    // The iOS silent switch would otherwise mute playback (same as video/[id]).
    void Audio.setAudioModeAsync({ playsInSilentModeIOS: true }).catch(() => undefined);
    return () => {
      void Audio.setAudioModeAsync({ playsInSilentModeIOS: false }).catch(() => undefined);
    };
  }, [watching]);

  return (
    <View className="gap-4">
      <PracticeTip
        text={
          localUri
            ? PRACTICE_SUMMARY_TIP_CLIP
            : permission?.granted
              ? PRACTICE_SUMMARY_TIP_NO_CLIP_GRANTED
              : PRACTICE_SUMMARY_TIP_NO_CLIP
        }
      />
      <Plate className="items-center gap-2">
        <Text className="font-mono-bold text-[10px] text-ink-3 uppercase tracking-caps-xl">
          Practice complete
        </Text>
        <Text testID="practice-verdict" className="font-display text-[36px] text-ink tracking-mark">
          {verdict(result, athleteId)}
        </Text>
        <Text className="font-body text-[13px] text-ink">Practice: rating unchanged</Text>
        <Text className="font-body text-[12px] text-ink-2">Nobody else sees this.</Text>
      </Plate>
      {localUri && watching ? (
        <Video
          testID="practice-clip-player"
          source={{ uri: localUri }}
          style={{ width: "100%", aspectRatio: 16 / 9, backgroundColor: "#000" }}
          useNativeControls
          isMuted
          shouldPlay
          resizeMode={ResizeMode.CONTAIN}
        />
      ) : null}
      {localUri && !watching ? (
        <PracticeButton
          testID="practice-watch-clip"
          label="Watch your clip"
          variant="secondary"
          onPress={() => setWatching(true)}
        />
      ) : null}
      <PracticeButton testID="practice-go-arena" label="Go to the Arena" onPress={onArena} />
      <PracticeButton testID="practice-done" label="Done" variant="secondary" onPress={onDone} />
      <PracticeButton
        testID="practice-again"
        label="Practice again"
        variant="tertiary"
        onPress={onAgain}
      />
    </View>
  );
}
