import * as React from "react";
import { Text, View } from "react-native";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { formatClock, keyMomentStepAt, type KeyMoment } from "@jits/shared/utils";
import { StatePressable } from "@/components/ui/state-pressable";
import { DISABLED_OPACITY } from "@/components/ui/elo-system/button";
import { filmChipLabelStyle, filmChipStyle } from "@/components/film-room/film-chip";
import { ON_MEDIA } from "@/lib/theme/palette";
import { TABULAR } from "@/lib/typography";

interface MomentStepperProps {
  moments: KeyMoment[];
  /** The playhead, in seconds. */
  positionS: number;
  /** The moment the playhead is still "on" (lit), else null. */
  currentT: number | null;
  onJump: (t: number) => void;
}

/** A 44 x 44 arrow in the film chip style; dimmed and inert at the ends. */
function StepArrow({ dir, target, onJump }: { dir: "prev" | "next"; target: KeyMoment | null; onJump: (t: number) => void }) {
  const Icon = dir === "prev" ? ChevronLeft : ChevronRight;
  const name = dir === "prev" ? "Previous key moment" : "Next key moment";
  return (
    <StatePressable
      dim
      testID={`moment-step-${dir}`}
      accessibilityRole="button"
      accessibilityLabel={target ? `${name}, ${formatClock(target.t)}` : name}
      accessibilityState={{ disabled: !target }}
      disabled={!target}
      onPress={() => target && onJump(target.t)}
      style={[filmChipStyle(false), { width: 44, paddingHorizontal: 0, alignItems: "center" }, !target && { opacity: DISABLED_OPACITY }]}
    >
      <Icon size={20} color={ON_MEDIA.white} strokeWidth={2} />
    </StatePressable>
  );
}

/**
 * The player's key moment stepper (jits-xfvd.18): [prev] [00:38 2/5] [next]
 * in the film chip style. The middle chip shows the moment at or before the
 * playhead (the first one's time before it), lit while the playhead is on
 * it, and tapping it replays that moment. Times only: AI move labels are
 * not shown in the player for anyone.
 */
export function MomentStepper({ moments, positionS, currentT, onJump }: MomentStepperProps) {
  const step = keyMomentStepAt(moments, positionS);
  if (!step) return null;
  const on = step.reached && currentT === step.shown.t;
  const clock = formatClock(step.shown.t);
  const count = `${step.index + 1}/${moments.length}`;
  return (
    <View testID="moment-stepper" accessibilityLabel="Key moments" className="flex-row items-center self-start" style={{ gap: 8 }}>
      <StepArrow dir="prev" target={step.prev} onJump={onJump} />
      <StatePressable
        dim
        testID="moment-step-current"
        accessibilityRole="button"
        accessibilityLabel={`Key moment ${step.index + 1} of ${moments.length}, ${clock}`}
        accessibilityHint="Plays from this moment"
        accessibilityState={{ selected: on }}
        onPress={() => onJump(step.shown.t)}
        style={[filmChipStyle(on), { flexDirection: "row", alignItems: "center", gap: 8, minWidth: 88 }]}
      >
        <Text testID="moment-step-time" className="font-mono-bold" style={[filmChipLabelStyle(on), TABULAR]}>
          {clock}
        </Text>
        <View style={{ width: 1, height: 12, backgroundColor: on ? ON_MEDIA.ink : ON_MEDIA.strong }} />
        <Text testID="moment-step-count" className="font-mono-bold" style={[filmChipLabelStyle(on), TABULAR]}>
          {count}
        </Text>
      </StatePressable>
      <StepArrow dir="next" target={step.next} onJump={onJump} />
    </View>
  );
}
