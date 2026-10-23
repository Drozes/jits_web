import * as React from "react";
import { View } from "react-native";
import { TIMEKEEPER_COPY } from "@/lib/match-flow/timekeeper-copy";
import { ON_MEDIA, usePalette } from "@/lib/theme/palette";
import { FIGHT_RADIUS } from "../fight/fight-tokens";
import { Mono } from "../fight/fight-ui";

/** Whole seconds until `at` (never below 0), re-read every second; null without a valid instant. */
export function useSecondsLeft(at: string | null): number | null {
  const target = at ? Date.parse(at) : Number.NaN;
  const valid = Number.isFinite(target);
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!valid) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, [valid, target]);
  return valid ? Math.max(0, Math.ceil((target - now) / 1_000)) : null;
}

/**
 * TK-D9, `NO CONTEST IN {m:ss}`: the countdown to the instant a
 * timekeeper-mode match becomes a no contest (A26). On every face-off screen
 * from the seat (the face-off timeout, all three roles; slice M3) and, read
 * only, while paused (the pause timeout) and offline (slice M4). Counts down
 * to `timeoutAt` from the timekeeper-mode state (`timeout_at`), the server's
 * own instant; the server's sweep, not this chip, ends the match. Renders
 * nothing without one (a two-athlete match never has one).
 *
 * The attention (amber) token, a still label (Motion Rule: the digits change
 * once a second, nothing animates), one accessibility element that speaks the
 * time left (TK-D9's spoken form). `tone` says where it sits: "themed" (the
 * default), the face-off's page in the app theme; "on-media", the live
 * screen over the camera (`liveTimeoutChip`), where the amber sits on the
 * on-media badge ground in both app themes (the theme's light-mode amber
 * would fail over the dark plate and the video).
 */
export function TimeoutChip({
  timeoutAt,
  testID = "timeout-chip",
  tone = "themed",
}: {
  timeoutAt: string | null;
  testID?: string;
  tone?: "themed" | "on-media";
}) {
  const p = usePalette();
  const seconds = useSecondsLeft(timeoutAt);
  if (seconds == null) return null;
  const copy = TIMEKEEPER_COPY["TK-D9"];
  const onMedia = tone === "on-media";
  const amber = onMedia ? ON_MEDIA.amber : p.amber;
  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={copy.a11y(seconds)}
      style={{
        alignSelf: "center",
        minHeight: 28,
        paddingHorizontal: 10,
        justifyContent: "center",
        borderWidth: 1,
        borderColor: onMedia ? ON_MEDIA.amberRule : p.amber,
        borderRadius: FIGHT_RADIUS.tag,
        ...(onMedia ? { backgroundColor: ON_MEDIA.badge } : null),
      }}
    >
      <Mono testID={`${testID}-text`} bold color={amber} spacing="caps-l">
        {copy.text(seconds)}
      </Mono>
    </View>
  );
}

/**
 * TK-D9 on the live screen (jits-o47s.29; spec 4.3, 14.8 M4): the chip above,
 * read-only, over the camera. `LiveStep`'s default `renderTimeoutChip`, so
 * every phone of a paused timekeeper-mode match, and an athlete whose
 * timekeeper is offline, counts down to the no contest.
 */
export function liveTimeoutChip(timeoutAt: string): React.ReactNode {
  return <TimeoutChip timeoutAt={timeoutAt} tone="on-media" />;
}
