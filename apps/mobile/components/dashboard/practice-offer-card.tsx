import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { markPracticeMatch } from "@jits/shared/api/mutations";
import { MetaTag, Plate } from "@/components/ui/elo-system";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth/hooks";
import { PRACTICE_OFFER_BODY, PRACTICE_OFFER_TITLE } from "@/lib/practice/constants";

/**
 * The one-time practice match offer on Home. A card, never a modal and never
 * auto-navigation. While it shows it holds Home's one Signal Red CTA.
 *
 * Start practice opens `/practice`, which marks the offer as answered on
 * mount. Not now marks it skipped (fire and forget) and hides the card at
 * once through `onDismiss`. Either way it is replayable from Settings.
 */
export function PracticeOfferCard({ onDismiss }: { onDismiss: () => void }) {
  const router = useRouter();
  const { refreshAthleteSoft } = useAuth();

  const notNow = () => {
    onDismiss();
    void markPracticeMatch(supabase, "skipped")
      .then((r) => {
        if (!r.ok) console.warn(`[practice] mark skipped failed: ${r.error.message}`);
        return refreshAthleteSoft();
      })
      .catch(() => undefined);
  };

  return (
    <Plate testID="practice-offer-card">
      <View className="flex-row items-center justify-between mb-2">
        <Text className="font-heading text-[18px] text-ink flex-1" numberOfLines={1}>
          {PRACTICE_OFFER_TITLE}
        </Text>
        <MetaTag>Practice</MetaTag>
      </View>
      <Text className="font-body text-[13px] text-ink-2 mb-3">{PRACTICE_OFFER_BODY}</Text>
      <Pressable
        testID="practice-offer-start"
        onPress={() => router.push("/practice")}
        accessibilityRole="button"
        className="bg-cta rounded-sm min-h-[44px] py-3 px-5 items-center justify-center active:bg-cta-hover"
      >
        <Text className="font-heading text-[13px] text-ink-on-cta uppercase tracking-caps">
          Start practice
        </Text>
      </Pressable>
      <Pressable
        testID="practice-offer-not-now"
        onPress={notNow}
        accessibilityRole="button"
        className="mt-2 min-h-[44px] items-center justify-center"
      >
        <Text className="font-mono text-[10px] text-ink-3 uppercase tracking-caps-l underline">
          Not now
        </Text>
      </Pressable>
    </Plate>
  );
}
