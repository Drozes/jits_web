import * as React from "react";
import { Text, View } from "react-native";
import { VideoView, useVideoPlayer } from "expo-video";
import { Plate } from "@/components/ui/elo-system";
import { Button } from "@/components/ui/elo-system/button";
import { PracticeTip } from "./practice-steps";
import { useMatchRecorder } from "@/components/match-flow/match-recorder-context";
import { onMediaTokens } from "@/lib/tokens";
import type { BroadcastResult } from "@jits/shared/hooks/use-session-match-sync";
import {
  PRACTICE_SUMMARY_TIP_CLIP,
  PRACTICE_SUMMARY_TIP_NO_CLIP,
  PRACTICE_SUMMARY_TIP_NO_CLIP_GRANTED,
} from "@/lib/practice/constants";

function verdict(result: BroadcastResult | null, athleteId: string): string {
  if (!result || result.result === "draw") return "DRAW";
  return result.winnerId === athleteId ? "YOU WON" : "YOU LOST";
}

/**
 * The end of the practice run. No rating number, no share, no match
 * details. The clip (if any) plays from the local file and is deleted
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
        <Text className="font-mono-bold tabular-nums text-micro text-ink-3 uppercase tracking-caps-xl">
          Practice complete
        </Text>
        <Text testID="practice-verdict" className="font-display text-display-36 text-ink tracking-mark">
          {verdict(result, athleteId)}
        </Text>
        <Text className="font-body text-body text-ink">Practice: rating unchanged</Text>
        <Text className="font-body text-small text-ink-2">Nobody else sees this.</Text>
      </Plate>
      {localUri && watching ? <PracticeClipPlayer uri={localUri} /> : null}
      {localUri && !watching ? (
        <Button
          height={44}
          testID="practice-watch-clip"
          label="Watch your clip"
          variant="secondary"
          onPress={() => setWatching(true)}
        />
      ) : null}
      <Button height={44} testID="practice-go-arena" label="Go to the Arena" onPress={onArena} />
      <Button height={44} testID="practice-done" label="Done" variant="secondary" onPress={onDone} />
      <Button
        height={44}
        testID="practice-again"
        label="Practice again"
        variant="ghost"
        onPress={onAgain}
      />
    </View>
  );
}

/**
 * The local practice clip: muted, autoplaying, native controls. expo-video
 * (linked in the field build since the reels), like the match player.
 */
function PracticeClipPlayer({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.muted = true;
    p.play();
  });
  return (
    <VideoView
      testID="practice-clip-player"
      player={player}
      style={{ width: "100%", aspectRatio: 16 / 9, backgroundColor: onMediaTokens.black }}
      nativeControls
      contentFit="contain"
      allowsPictureInPicture={false}
    />
  );
}
