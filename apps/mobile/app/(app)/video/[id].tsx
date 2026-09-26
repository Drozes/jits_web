import * as React from "react";
import { ActivityIndicator, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Audio, ResizeMode, Video } from "expo-av";
import { AppHeader } from "@/components/layout/app-header";
import { HarnessMarker } from "@/components/match-detail/harness-marker";
import { VideoStatePanel } from "@/components/match-detail/video-state-panel";
import { useVideoPlayback } from "@/lib/match-detail/use-video-playback";
import { useThemedTokens } from "@/lib/theme/use-theme";

/**
 * Full-screen playback of one match video. `useVideoPlayback` signs a 1-hour
 * URL against the private match-videos bucket (participant-gated RLS on both
 * the row read and the sign), prefers the normalized MP4, and re-signs once
 * silently when the player errors (an expired URL mid-match), resuming at the
 * last position. Playback streams progressively; nothing is downloaded.
 *
 * Player is expo-av's Video because that module is already embedded in the
 * field build, so this screen can ship over OTA. The expo-video swap is
 * planned with the Phase 2 TestFlight build (jits-kaf.2.6): an OTA must
 * never reference a native module the installed binary does not carry.
 *
 * The `video-player-state` marker exposes the phase to the match-loop
 * harness as "Video state: <state>"; `loaded` means the player reported
 * `isLoaded` at least once for the current URL.
 */
export default function MatchVideoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const tokens = useThemedTokens();
  const { phase, source, stateLabel, videoRef, retry, onPlayerError, onPlayerStatus } =
    useVideoPlayback(id);

  // iOS routes audio through the ringer switch by default, so with the
  // silent switch on a match video played with no sound at all. Play
  // through it while this screen is up, then hand the session back.
  React.useEffect(() => {
    void Audio.setAudioModeAsync({ playsInSilentModeIOS: true }).catch(() => undefined);
    return () => {
      void Audio.setAudioModeAsync({ playsInSilentModeIOS: false }).catch(() => undefined);
    };
  }, []);

  const goBack = React.useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }, [router]);

  return (
    <View className="flex-1 bg-surface">
      <AppHeader title="Match Video" back />
      <View className="flex-1">
        {phase === "ready" && source ? (
          <Video
            key={`${source.generation}:${source.url}`}
            ref={videoRef}
            source={{ uri: source.url }}
            posterSource={source.posterUrl ? { uri: source.posterUrl } : undefined}
            usePoster={!!source.posterUrl}
            style={{ flex: 1, backgroundColor: "#000" }}
            useNativeControls
            resizeMode={ResizeMode.CONTAIN}
            shouldPlay
            onPlaybackStatusUpdate={onPlayerStatus}
            // The row read and the sign both succeeded, so the recording
            // exists: an error here is an expired URL or the network.
            onError={onPlayerError}
          />
        ) : phase === "loading" || phase === "ready" ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color={tokens.accentCta} />
          </View>
        ) : (
          <VideoStatePanel kind={phase} onRetry={retry} onBack={goBack} />
        )}
      </View>
      <HarnessMarker testID="video-player-state" label={`Video state: ${stateLabel}`} />
    </View>
  );
}
