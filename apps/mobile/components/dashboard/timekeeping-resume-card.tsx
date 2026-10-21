import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Timer } from "lucide-react-native";
import type { MyTimekeepingMatch } from "@jits/shared/api/timekeeper";
import { Plate } from "@/components/ui/elo-system";
import { Button } from "@/components/ui/elo-system/button";
import { Label } from "@/components/ui/elo-system/label";
import { arenaMatchHref } from "@/lib/arena/constants";
import { shortName } from "@/lib/match-flow/short-name";
import { TIMEKEEPER_COPY as T } from "@/lib/match-flow/timekeeper-copy";
import { usePalette } from "@/lib/theme/palette";

/** `4:35 PM`: the device's short local time (TK-H8). */
export function formatEditDeadline(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** What the card says, or null when it has nothing to offer. */
export function timekeepingCardCopy(match: MyTimekeepingMatch, now: number): { line: string; cta: string } | null {
  if (match.status === "completed") {
    const closes = match.editClosesAt ? Date.parse(match.editClosesAt) : NaN;
    if (!match.editOpen || !(closes > now)) return null;
    return { line: T["TK-H8"](formatEditDeadline(match.editClosesAt as string)), cta: T["TK-H9"] };
  }
  return { line: match.endedAt ? T["TK-H4"] : T["TK-H3"], cta: T["TK-H5"] };
}

/**
 * Home's way back to a match this athlete is TIMEKEEPING (A20, spec 9.1;
 * board P-TK-B12): seated, live, waiting on their result, or recorded and
 * still editable (A24). Unmistakably the timekeeper's card: the amber
 * `TIMEKEEPER` role tag and a stopwatch where the athlete card has its state
 * tag, the matchup as its title. It offers; it never navigates by itself.
 *
 * `primary`: the card holds Home's one red CTA (only while on duty and no
 * athlete Resume card shows); otherwise its action is secondary.
 */
export function TimekeepingResumeCard({ match, primary }: { match: MyTimekeepingMatch; primary: boolean }) {
  const router = useRouter();
  const p = usePalette();
  const copy = timekeepingCardCopy(match, Date.now());
  if (!copy) return null;
  const [a, b] = match.athletes.map((x) => shortName(x.displayName));
  return (
    <Plate testID="timekeeping-resume-card">
      <View className="mb-2 flex-row items-center gap-2">
        <Timer size={16} color={p.amber} />
        <View className="self-start rounded-xs border border-attention px-2 py-1">
          <Label testID="timekeeping-resume-role" className="text-attention">
            {T["TK-H1"]}
          </Label>
        </View>
      </View>
      <Text testID="timekeeping-resume-title" className="font-heading text-title text-ink" numberOfLines={1}>
        {T["TK-H2"]({ a: a ?? "", b: b ?? "" })}
      </Text>
      <Text testID="timekeeping-resume-line" className="mb-3 mt-1 font-body text-body text-ink-2" numberOfLines={2}>
        {copy.line}
      </Text>
      <Button
        testID="timekeeping-resume-cta"
        label={copy.cta}
        variant={primary ? "primary" : "secondary"}
        height={44}
        onPress={() => router.push(arenaMatchHref(match.matchId))}
      />
    </Plate>
  );
}
