import * as React from "react";
import { Text, View } from "react-native";
import { cn } from "@/lib/cn";
import { HIGHLIGHT_COPY } from "@/lib/highlight/highlight-copy";
import { useAmber } from "../use-amber";

/**
 * GENERATING chip (the `MatchVideoStatus` processing-chip precedent) and the
 * two honest stages: planning = step 1 active, rendering = step 2 active.
 * Static: no spinner, no animation (not a registered animation in the
 * Motion Rule registry, DESIGN.md "Motion").
 */
export function HighlightProgressSteps({ activeStep }: { activeStep: 1 | 2 }) {
  const amber = useAmber();
  const steps = [HIGHLIGHT_COPY.stepFind, HIGHLIGHT_COPY.stepCut];
  return (
    <View testID="highlight-progress" className="gap-3">
      <View className={cn("self-start px-2 py-1 border rounded-xs", amber.border)}>
        <Text className={cn("font-mono-bold text-micro uppercase tracking-caps-l tabular-nums", amber.text)}>
          {HIGHLIGHT_COPY.generatingChip}
        </Text>
      </View>
      <View className="gap-2">
        {steps.map((label, i) => {
          const step = i + 1;
          const active = step === activeStep;
          const done = step < activeStep;
          return (
            <View
              key={label}
              testID={`highlight-step-${step}`}
              accessibilityState={{ selected: active }}
              className="flex-row items-center gap-2"
            >
              <View
                className={cn(
                  "border",
                  active || done ? "bg-ink border-ink" : "border-hairline-strong",
                )}
                style={{ width: 8, height: 8 }}
              />
              <Text
                className={cn("font-body text-body", active ? "text-ink" : "text-ink-3")}
              >
                {label}
              </Text>
            </View>
          );
        })}
      </View>
      <Text className="font-body text-small text-ink-3">{HIGHLIGHT_COPY.eta}</Text>
    </View>
  );
}
