import { View, Text } from "react-native";
import { cn } from "@/lib/cn";

type Outcome = "win" | "loss" | "draw";

interface OutcomeTagProps {
  outcome: Outcome;
  className?: string;
}

const LETTER: Record<Outcome, string> = {
  win: "W",
  loss: "L",
  draw: "D",
};

const BORDER_CLASS: Record<Outcome, string> = {
  win: "border-positive",
  loss: "border-negative",
  draw: "border-hairline-strong",
};

const TEXT_CLASS: Record<Outcome, string> = {
  win: "text-positive",
  loss: "text-negative",
  draw: "text-ink-3",
};

export function OutcomeTag({ outcome, className }: OutcomeTagProps) {
  return (
    <View
      accessibilityLabel={outcome}
      className={cn(
        "px-2 py-1 border rounded-xs items-center justify-center min-w-[36px]",
        BORDER_CLASS[outcome],
        className,
      )}
    >
      <Text
        className={cn(
          "font-mono-bold text-[10px] uppercase tracking-caps-l",
          TEXT_CLASS[outcome],
        )}
      >
        {LETTER[outcome]}
      </Text>
    </View>
  );
}
