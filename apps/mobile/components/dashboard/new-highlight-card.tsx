import { Pressable, Text, View } from "react-native";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { Clapperboard, X } from "lucide-react-native";
import { logHighlightEvent } from "@/lib/highlight/highlight-event";
import { MetaTag, Plate } from "@/components/ui/elo-system";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { DISCOVERY_COPY, highlightHref } from "@/lib/highlight/discovery";
import type { NewHighlight } from "@/lib/highlight/use-new-highlight";

/**
 * Home's "Your new highlight" card (jr_be spec 015 section 16.6.4): the
 * athlete's latest unseen ready reel, a small 9:16 poster, "Watch" and a
 * dismiss. It carries NO Signal Red CTA: Home's one red CTA is Resume or the
 * practice offer. Poster and Watch both open the viewer (`source=home`).
 */
export function NewHighlightCard({
  highlight,
  onDismiss,
}: {
  highlight: NewHighlight;
  onDismiss: () => void;
}) {
  const router = useRouter();
  const tokens = useThemedTokens();
  const { item, posterUrl } = highlight;
  const opponent = item.opponentName?.trim() || null;
  const seconds = Math.round(item.durationS);

  const open = () => {
    logHighlightEvent(item.highlightId, "home_card_tapped", { source: "home" });
    router.push(highlightHref(item.highlightId, "home") as never);
  };

  return (
    <Plate testID="new-highlight-card" className="flex-row gap-3">
      <Pressable
        testID="new-highlight-poster"
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={opponent ? `Watch your highlight vs ${opponent}` : "Watch your highlight"}
        className="w-[54px] h-[96px] rounded-xs overflow-hidden bg-surface-4 items-center justify-center"
      >
        {posterUrl ? (
          <Image source={{ uri: posterUrl }} style={{ width: 54, height: 96 }} contentFit="cover" />
        ) : (
          <View pointerEvents="none">
            <Clapperboard size={18} color={tokens.textTertiary} />
          </View>
        )}
      </Pressable>
      <View className="flex-1 min-w-0 gap-2">
        <View className="flex-row items-start justify-between gap-2">
          <MetaTag>{DISCOVERY_COPY.homeMetaTag}</MetaTag>
          <Pressable
            testID="new-highlight-dismiss"
            onPress={onDismiss}
            accessibilityRole="button"
            accessibilityLabel={DISCOVERY_COPY.dismiss}
            hitSlop={8}
            className="w-6 h-6 items-center justify-center rounded-xs active:bg-surface-4"
          >
            <View pointerEvents="none">
              <X size={14} color={tokens.textTertiary} />
            </View>
          </Pressable>
        </View>
        <Text className="font-heading text-[16px] text-ink" numberOfLines={1}>
          {DISCOVERY_COPY.homeTitle}
        </Text>
        <Text testID="new-highlight-line" className="font-body text-[13px] text-ink-2" numberOfLines={1}>
          {opponent ? `vs ${opponent} · ` : ""}
          <Text className="font-mono tabular-nums">{seconds}s</Text>
        </Text>
        <Pressable
          testID="new-highlight-watch"
          onPress={open}
          accessibilityRole="button"
          className="self-start border border-hairline-strong rounded-sm bg-surface-3 py-2 px-4 active:bg-surface-4"
        >
          <Text className="font-heading text-[12px] text-ink uppercase tracking-caps">
            {DISCOVERY_COPY.watch}
          </Text>
        </Pressable>
      </View>
    </Plate>
  );
}
