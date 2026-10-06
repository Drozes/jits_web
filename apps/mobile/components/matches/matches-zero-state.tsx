import * as React from "react";
import { Text, View } from "react-native";
import { useRouter } from "expo-router";
import { UserPlus, Video } from "lucide-react-native";
import { ARENA_HREF } from "@/lib/arena/constants";
import { logEmptyCta } from "@/lib/matches/telemetry";
import { useZeroSecondaryAction, type ZeroAthlete } from "@/lib/matches/use-zero-secondary-action";
import { usePalette } from "@/lib/theme/palette";
import { TABULAR, TRACKING, typeStep } from "@/lib/typography";
import { Button } from "@/components/ui/elo-system/button";
import type { StillAthlete } from "@/components/film-room/opening-still";
import { MatchGhostCard } from "./match-ghost-card";
import { TextAction } from "./text-action";
import { RECORDING_HELPER } from "./match-feed-media";

/** Spec 11 copy for the zero state. */
export const ZERO_COPY = {
  ghost: "Your first match will show up here",
  ghostClipsOff: "Your first match lands here",
  progress: "0 of 1 matches to your first highlight",
  primary: "Find a match in the Arena",
  invite: "Challenge a friend",
  inviteA11y: "Challenge a friend to a match. Opens an invite with a QR code and link.",
  practice: "Try a practice match",
  helper: "Turn on Record from my phone at face-off and we cut your best moments into a highlight.",
} as const;

/** The shipped challenge invite screen, attributed to this surface (B5, jr_be-gpz). */
export const MATCHES_INVITE_HREF = "/invite?from=matches";
export const PRACTICE_HREF = "/practice";

interface MatchesZeroStateProps {
  athlete: ZeroAthlete;
  viewer: StillAthlete;
  /** `highlight_clips_enabled`: off swaps the highlight copy for film copy (spec 10.7). */
  clipsEnabled: boolean;
}

/**
 * The Matches tab for an athlete with no matches (specs/matches-tab 10.2):
 * a ghost match card, the progress line (clips on), the screen's one red
 * CTA to the Arena tab, one secondary action (Challenge a friend while
 * invites are on, else the practice link when offered, else nothing; an
 * empty slot of the same height while the flag is unknown) and the
 * recording helper. The ghost reel tiles live in the carousel slot above.
 */
export function MatchesZeroState({ athlete, viewer, clipsEnabled }: MatchesZeroStateProps) {
  const p = usePalette();
  const router = useRouter();
  const secondary = useZeroSecondaryAction(athlete);
  const go = (cta: "arena" | "invite" | "practice", href: string) => {
    logEmptyCta({ surface: "matches", state: "zero", cta });
    router.push(href);
  };

  return (
    <View testID="matches-zero" style={{ gap: 16, marginTop: 18 }}>
      <MatchGhostCard testID="matches-zero-ghost" caption={clipsEnabled ? ZERO_COPY.ghost : ZERO_COPY.ghostClipsOff} viewer={viewer} />
      {clipsEnabled ? (
        <View testID="matches-zero-progress" style={{ gap: 6 }}>
          <Text className="font-mono-bold uppercase" style={[typeStep("micro"), { letterSpacing: TRACKING["caps-l"], color: p.text2 }, TABULAR]}>
            {ZERO_COPY.progress}
          </Text>
          <View accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 1, now: 0 }} style={{ height: 3, backgroundColor: p.strong }} />
        </View>
      ) : null}
      <Button testID="matches-zero-arena" variant="primary" label={ZERO_COPY.primary} accessibilityHint="Opens the Arena tab" onPress={() => go("arena", ARENA_HREF)} />
      <View testID="matches-zero-secondary" style={{ minHeight: 44, justifyContent: "center" }}>
        {secondary === "invite" ? (
          <TextAction
            testID="matches-zero-invite"
            label={ZERO_COPY.invite}
            accessibilityLabel={ZERO_COPY.inviteA11y}
            icon={(c) => <UserPlus size={16} color={c} />}
            onPress={() => go("invite", MATCHES_INVITE_HREF)}
          />
        ) : secondary === "practice" ? (
          <TextAction testID="matches-zero-practice" label={ZERO_COPY.practice} onPress={() => go("practice", PRACTICE_HREF)} />
        ) : null}
      </View>
      <View className="flex-row" style={{ gap: 6, alignItems: "flex-start" }}>
        <Video size={14} color={p.text3} style={{ marginTop: 2 }} />
        <Text testID="matches-zero-helper" className="font-body flex-1" style={[typeStep("small"), { color: p.text2 }]}>
          {clipsEnabled ? ZERO_COPY.helper : RECORDING_HELPER}
        </Text>
      </View>
    </View>
  );
}
