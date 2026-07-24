import * as React from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { ResizeMode, Video } from "expo-av";
import { supabase } from "@/lib/supabase/client";
import { getMatchVideoSignedUrl } from "@jits/shared/api/queries";
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
export default function MatchVideoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tokens = useThemedTokens();
  const [url, setUrl] = React.useState<string | null>(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      const signed = await getMatchVideoSignedUrl(supabase, id);
      if (cancelled) return;
      if (signed) setUrl(signed);
      else setFailed(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <View className="flex-1 bg-surface">
      <AppHeader title="Match Video" back />
      {failed ? (
        <View className="flex-1 items-center justify-center px-8 gap-2">
          <Text className="font-mono text-[11px] text-negative uppercase tracking-caps-l text-center">
            Video Unavailable
          </Text>
          <Text className="font-body text-[12px] text-ink-3 text-center">
            The recording may still be uploading, or you may not have access
            to it.
          </Text>
        </View>
      ) : !url ? (
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
          onError={() => setFailed(true)}
        />
      )}
    </View>
  );
}
