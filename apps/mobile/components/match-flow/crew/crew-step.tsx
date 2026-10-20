import { ActivityIndicator, Text, View } from "react-native";
import { ChevronLeft } from "lucide-react-native";
import { StatePressable } from "@/components/ui/state-pressable";
import { usePalette } from "@/lib/theme/palette";
import { TRACKING, typeStep } from "@/lib/typography";
import { useCrewLeave } from "@/lib/match-flow/use-crew-leave";
import { SHIPPED_COPY } from "@/lib/match-flow/timekeeper-copy";

export interface CrewStepProps {
  matchId: string;
  /** Where the athlete's Leave (cancel for all, before anyone is seated) exits to. */
  exitHref: string;
}

/**
 * The `crew` step (timekeeper mode, athletes only): pick a timekeeper before
 * the face-off (spec 4.2 Pick, TK-P1 to TK-P23, TK-W1). The match, the
 * viewer's roles and the timekeeper-mode state (the open request, the last
 * outcome) come from `useMatchFlow()`.
 *
 * Stub with its final name and props (timekeeper mode PLAN 3.2, slice M1):
 * the picker itself is slice M2 (jits-o47s.3). A two-athlete match never
 * reaches this step. Leave is already here (spec 4.3, `useCrewLeave`: it
 * confirms with the shipped alert and cancels for both, and so does Android
 * back); M2 lays the control out on the picker and keeps the hook.
 */
export function CrewStep({ matchId, exitHref }: CrewStepProps) {
  const p = usePalette();
  const { cancelling, leave } = useCrewLeave({ matchId, exitHref });
  return (
    <View testID="crew-step">
      <StatePressable
        testID="crew-leave"
        accessibilityRole="button"
        // The face-off's Leave (deck A2): it cancels the match for both athletes.
        accessibilityLabel={SHIPPED_COPY.leave.a11y}
        accessibilityState={{ disabled: cancelling, busy: cancelling }}
        disabled={cancelling}
        onPress={leave}
        hitSlop={8}
        style={{ height: 44, flexDirection: "row", alignItems: "center", alignSelf: "flex-start", gap: 6, opacity: cancelling ? 0.6 : 1 }}
      >
        {cancelling ? <ActivityIndicator size="small" color={p.text} /> : <ChevronLeft size={18} color={p.text} />}
        <Text className="font-heading uppercase" style={[typeStep("body"), { letterSpacing: TRACKING.caps, color: p.text }]}>
          {SHIPPED_COPY.leave.text}
        </Text>
      </StatePressable>
    </View>
  );
}
