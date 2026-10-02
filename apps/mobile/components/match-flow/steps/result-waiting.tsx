import { Text, View } from "react-native";
import { formatElapsed } from "@/lib/match-flow/format-elapsed";
import { usePalette } from "@/lib/theme/palette";
import { TRACKING, typeStep } from "@/lib/typography";
import { FIGHT_RADIUS, TABULAR } from "../fight/fight-tokens";
import { FightButton, InitialsBlock, Mono, shortName } from "../fight/fight-ui";
import type { ResultAthlete } from "./result-form";

/**
 * The other phone while one athlete records the result. Nothing to do here
 * but wait: the result arrives by broadcast or the reconciler and moves this
 * phone to confirm. There is no "leave and confirm later" button (jits-02vo.7):
 * closing the app is still allowed, and an undisputed result is confirmed by
 * the backend once its lock window passes (jr_be-ahn.5).
 */
export function ResultWaiting({
  claimer,
  me,
  opponent,
  durationSeconds,
  endedAtSeconds,
  onTakeOver,
}: {
  claimer: ResultAthlete;
  me: ResultAthlete;
  opponent: ResultAthlete;
  durationSeconds: number;
  endedAtSeconds?: number;
  /** Offered once the claim has gone a minute without a result. */
  onTakeOver?: () => void;
}) {
  const p = usePalette();
  const name = shortName(claimer.displayName);
  const cells = [
    { label: "ENDED AT", value: endedAtSeconds != null ? formatElapsed(endedAtSeconds) : "--:--" },
    { label: "CLOCK", value: formatElapsed(durationSeconds) },
  ];
  return (
    <View testID="result-waiting" style={{ gap: 20 }}>
      <Mono>MATCH OVER</Mono>
      <View accessibilityRole="summary" accessibilityLiveRegion="polite" style={{ alignItems: "center", gap: 24, paddingVertical: 24 }}>
        <InitialsBlock name={claimer.displayName} size={96} fontSize="headline-2xl" />
        <Text className="font-display" style={[typeStep("display-48"), { maxWidth: 320, textAlign: "center", lineHeight: 46, color: p.text }]}>
          {`${name} is recording the result`}
        </Text>
        <Dots />
        <Text className="font-body" style={[typeStep("callout"), { color: p.text2, textAlign: "center" }]}>
          You{"’"}ll confirm it in a moment.
        </Text>
      </View>
      <View style={{ backgroundColor: p.plate, borderWidth: 1, borderColor: p.hairline, borderRadius: FIGHT_RADIUS.plate, overflow: "hidden" }}>
        <View style={{ flexDirection: "row" }}>
          {cells.map((c, i) => (
            <View key={c.label} style={{ flex: 1, paddingVertical: 14, paddingHorizontal: 12, gap: 8, borderLeftWidth: i ? 1 : 0, borderColor: p.hairline }}>
              <Mono color={p.text3}>{c.label}</Mono>
              <Text className="font-mono-bold" style={[typeStep("title"), { color: p.text }, TABULAR]}>
                {c.value}
              </Text>
            </View>
          ))}
        </View>
        <View style={{ padding: 12, flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderColor: p.hairline }}>
          <Text numberOfLines={1} className="font-heading uppercase" style={[typeStep("body"), { flex: 1, letterSpacing: TRACKING.loose, color: p.text }]}>
            {`${shortName(me.displayName)} vs ${shortName(opponent.displayName)}`}
          </Text>
          <Mono size="caption" spacing="normal">
            {[me.elo, opponent.elo].map((e) => (e != null ? String(e) : "--")).join(" · ")}
          </Mono>
        </View>
      </View>
      {onTakeOver ? (
        <View style={{ gap: 8 }}>
          <Text className="font-body" style={[typeStep("body"), { color: p.text2, textAlign: "center" }]}>
            {`Still no result from ${name}.`}
          </Text>
          <FightButton testID="result-take-over" variant="secondary" label="Record it myself" onPress={onTakeOver} />
        </View>
      ) : null}
    </View>
  );
}

/** Static: only the countdown and the verdict celebration may auto-animate. */
function Dots() {
  const p = usePalette();
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ flexDirection: "row", gap: 8, height: 12, alignItems: "center" }}>
      {[1, 0.6, 0.3].map((o) => (
        <View key={o} style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: p.text, opacity: o }} />
      ))}
    </View>
  );
}
