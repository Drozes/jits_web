import { Text, View } from "react-native";
import { Film } from "lucide-react-native";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { useHighlightFlags } from "@/lib/highlight/use-highlight-flags";
import { DISCOVERY_COPY } from "@/lib/highlight/discovery";

/**
 * Post-match reassurance that a reel is on its way (jr_be spec 015 section
 * 16.6.4): only when this match has a recording (landed or still uploading)
 * AND `highlight_clips_enabled` is on. Fail-closed: nothing renders until the
 * flag read says clips are on. Muted text, no link, no progress.
 */
export function SummaryHighlightNote({ hasVideo }: { hasVideo: boolean }) {
  // No recording, no reel: skip the flag read entirely.
  return hasVideo ? <FlaggedNote /> : null;
}

function FlaggedNote() {
  const { clipsEnabled } = useHighlightFlags();
  const tokens = useThemedTokens();
  if (!clipsEnabled) return null;
  return (
    <View testID="summary-highlight-note" className="flex-row items-center justify-center gap-2 px-2">
      <View pointerEvents="none">
        <Film size={12} color={tokens.textSecondary} />
      </View>
      <Text className="font-body text-small text-ink-2 text-center">{DISCOVERY_COPY.summaryNote}</Text>
    </View>
  );
}
