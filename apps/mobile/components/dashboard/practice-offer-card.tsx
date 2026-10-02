import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { markPracticeMatch } from "@jits/shared/api/mutations";
import { MetaTag, Plate } from "@/components/ui/elo-system";
import { Button } from "@/components/ui/elo-system/button";
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
        <Text className="font-heading text-title text-ink flex-1" numberOfLines={1}>
          {PRACTICE_OFFER_TITLE}
        </Text>
        <MetaTag>Practice</MetaTag>
      </View>
      <Text className="font-body text-body text-ink-2 mb-3">{PRACTICE_OFFER_BODY}</Text>
      <Button
        testID="practice-offer-start"
        label="Start practice"
        height={44}
        onPress={() => router.push("/practice")}
      />
      <Button
        testID="practice-offer-not-now"
        variant="ghost"
        label="Not now"
        height={44}
        className="mt-2"
        onPress={notNow}
      />
    </Plate>
  );
}
