import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { MetaTag, Plate } from "@/components/ui/elo-system";
import { ARENA_HREF } from "@/lib/arena/constants";

/**
 * Home's way into a match. The Arena is the only matchmaking path on mobile
 * (no gym sessions, jits-gewv), so this is the one Signal Red CTA on Home.
 */
export function ArenaNudgeCard() {
  const router = useRouter();

  return (
    <Plate>
      <View className="flex-row items-center justify-between mb-2">
        <Text className="font-heading text-[18px] text-ink flex-1" numberOfLines={1}>
          Find a match
        </Text>
        <MetaTag>Arena</MetaTag>
      </View>
      <Text className="font-body text-[13px] text-ink-2 mb-3">
        Go live in the Arena to challenge athletes who are online and take their
        challenges as they come in.
      </Text>
      <Pressable
        onPress={() => router.push(ARENA_HREF)}
        accessibilityRole="button"
        accessibilityLabel="Go to the Arena"
        className="bg-cta rounded-sm min-h-[44px] py-3 px-5 items-center justify-center active:bg-cta-hover"
      >
        <Text className="font-heading text-[13px] text-ink-on-cta uppercase tracking-caps">
          Enter the Arena →
        </Text>
      </Pressable>
    </Plate>
  );
}
