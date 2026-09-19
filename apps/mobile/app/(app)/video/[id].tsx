import * as React from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { ResizeMode, Video } from "expo-av";
import { supabase } from "@/lib/supabase/client";
import { getMatchVideoSignedUrlResult } from "@jits/shared/api/queries";
import { AppHeader } from "@/components/layout/app-header";
import { useThemedTokens } from "@/lib/theme/use-theme";

/**
 * Full-screen playback of one match video. Fetches a 1-hour signed URL
 * against the private match-videos bucket (participant-gated RLS on both
 * the row read and the sign) and hands it to the player with native
 * controls (scrub, fullscreen, AirPlay).
 *
 * Player is expo-av's Video because that module is already embedded in the
 * field build, so this screen can ship over OTA. The expo-video swap is
 * planned with the Phase 2 TestFlight build (jits-kaf.2.6): an OTA must
 * never reference a native module the installed binary does not carry.
 */

/**
 * "absent" and "failed" are deliberately separate (jits-icei.5).
 *
 * getMatchVideoSignedUrl used to collapse both into null, so a transient
 * PostgREST failure rendered as "Video Unavailable" and told an athlete their
 * match video does not exist. getMatchVideoSignedUrlResult distinguishes them:
 * `{ ok: true, data: null }` is a real absence (no recording on the row, or the
 * row is hidden from a non-participant), while `{ ok: false }` means the read
 * or the signing failed and we know nothing, which deserves a retry rather than
 * an empty state.
 *
 * The verdict is read off the RESOLVED value, never a rejection: supabase-js
 * resolves even a hard network failure into `{ data: null, error }`.
 */
type PlaybackPhase = "loading" | "ready" | "absent" | "failed";

export default function MatchVideoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tokens = useThemedTokens();
  const [url, setUrl] = React.useState<string | null>(null);
  const [phase, setPhase] = React.useState<PlaybackPhase>("loading");
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setPhase("loading");
    (async () => {
      const result = await getMatchVideoSignedUrlResult(supabase, id);
      if (cancelled) return;
      if (!result.ok) {
        setPhase("failed");
        return;
      }
      if (!result.data) {
        setPhase("absent");
        return;
      }
      setUrl(result.data);
      setPhase("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, [id, attempt]);

  const retry = React.useCallback(() => setAttempt((n) => n + 1), []);

  return (
    <View className="flex-1 bg-surface">
      <AppHeader title="Match Video" back />
      {phase === "failed" ? (
        <View
          testID="video-load-failed"
          className="flex-1 items-center justify-center px-8 gap-2"
        >
          <Text className="font-mono text-[11px] text-negative uppercase tracking-caps-l text-center">
            Couldn{"’"}t Load Video
          </Text>
          <Text className="font-body text-[12px] text-ink-3 text-center">
            Something went wrong reading this recording. It is most likely
            still there.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry loading video"
            onPress={retry}
            hitSlop={{ top: 14, bottom: 14, left: 8, right: 8 }}
            className="active:opacity-70"
          >
            <Text className="font-mono-bold text-[10px] text-cta uppercase tracking-caps-l">
              Try Again
            </Text>
          </Pressable>
        </View>
      ) : phase === "absent" ? (
        <View
          testID="video-unavailable"
          className="flex-1 items-center justify-center px-8 gap-2"
        >
          <Text className="font-mono text-[11px] text-negative uppercase tracking-caps-l text-center">
            Video Unavailable
          </Text>
          <Text className="font-body text-[12px] text-ink-3 text-center">
            The recording may still be uploading, or you may not have access
            to it.
          </Text>
        </View>
      ) : phase === "loading" || !url ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={tokens.accentCta} />
        </View>
      ) : (
        <Video
          source={{ uri: url }}
          style={{ flex: 1, backgroundColor: "#000" }}
          useNativeControls
          resizeMode={ResizeMode.CONTAIN}
          shouldPlay
          // A player error is a failure, not an absence: the row read and the
          // signing both succeeded, so the recording does exist.
          onError={() => setPhase("failed")}
        />
      )}
    </View>
  );
}
