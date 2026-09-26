import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import type { MyActiveMatch } from "@jits/shared/api/queries";
import { MetaTag, Plate } from "@/components/ui/elo-system";
import { arenaMatchHref } from "@/lib/arena/constants";

/**
 * Home's way back into a match the app lost (jits-r9a: killed or restarted
 * mid-match). Only shown while one is open, and while it is, Resume is the
 * one Signal Red CTA on Home (the Arena card steps down to secondary).
 *
 * Resume pushes the same `/match/<id>` route the Arena handshake lands on, so
 * the match screen's `useArenaMatchScreen` takes the athlete offline and
 * suppresses challenge prompts exactly as it does for a fresh match, and the
 * wizard derives its step from `matches.status`.
 */
export function ResumeMatchCard({ match }: { match: MyActiveMatch }) {
  const router = useRouter();
  const started = match.status === "in_progress";

  return (
    <Plate variant="accent">
      <View className="flex-row items-center justify-between mb-2">
        <Text className="font-heading text-[18px] text-ink flex-1" numberOfLines={1}>
          {started ? "Match in progress" : "Match waiting to start"}
        </Text>
        <MetaTag>{started ? "Live" : "Ready"}</MetaTag>
      </View>
      <Text className="font-body text-[13px] text-ink-2 mb-3" numberOfLines={2}>
        {match.opponentName ? `vs ${match.opponentName}. ` : ""}
        Pick up where you left off.
      </Text>
      <Pressable
        onPress={() => router.push(arenaMatchHref(match.matchId))}
        accessibilityRole="button"
        accessibilityLabel="Resume your match"
        className="bg-cta rounded-sm min-h-[44px] py-3 px-5 items-center justify-center active:bg-cta-hover"
      >
        <Text className="font-heading text-[13px] text-ink-on-cta uppercase tracking-caps">
          Resume match →
        </Text>
      </Pressable>
    </Plate>
  );
}
