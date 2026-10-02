import { Pressable, Text, View } from "react-native";
import { Handshake, Swords } from "lucide-react-native";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { cn } from "@/lib/cn";
import { SelectCheck, selectionSurface } from "@/components/ui/elo-system/selection";

export interface ResultParticipant {
  id: string;
  displayName: string;
}

/**
 * Submission / Draw segmented toggle. ELO design system: two chip-style
 * cells inside a hairline-bordered surface, active state lifts to
 * surface-4 with a hairline-strong edge and an ink glyph + caps label (the
 * one selected-state treatment; never red, WP2). Like the Chip, this compact
 * segmented control carries no check mark: its icon and label both step from
 * ink-3 to ink, so the state never rests on the edge alone (DESIGN.md Open
 * decision 14 names the exception).
 */
export function OutcomeToggle({
  value,
  onChange,
}: {
  value: "submission" | "draw" | null;
  onChange: (v: "submission" | "draw") => void;
}) {
  const tokens = useThemedTokens();
  return (
    <View className="gap-2">
      <Text className="font-mono-bold tabular-nums text-micro text-ink-3 uppercase tracking-caps-xl">
        Outcome
      </Text>
      <View className="flex-row gap-2 rounded-md bg-surface-3 border border-hairline-strong p-1">
        {(["submission", "draw"] as const).map((opt) => {
          const active = value === opt;
          return (
            <Pressable
              key={opt}
              testID={`result-outcome-${opt}`}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => onChange(opt)}
              className={cn(
                "flex-1 flex-row items-center justify-center gap-2 rounded-xs py-3",
                active ? "bg-surface-4 border border-hairline-strong" : "border border-transparent active:bg-surface-4",
              )}
            >
              {opt === "submission" ? (
                <Swords
                  size={14}
                  color={active ? tokens.textPrimary : tokens.textTertiary}
                />
              ) : (
                <Handshake
                  size={14}
                  color={active ? tokens.textPrimary : tokens.textTertiary}
                />
              )}
              <Text
                className={cn(
                  "font-heading text-caption uppercase tracking-caps",
                  active ? "text-ink" : "text-ink-3",
                )}
              >
                {opt === "submission" ? "Submission" : "Draw"}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/**
 * Two-button winner picker. ELO design system: two-up tappable cards; the
 * active one steps to surface-4 with an ink check (never red, WP2).
 * Mirrors D8 wireframe (lines 1249-1253).
 */
export function WinnerPicker({
  participants,
  winnerId,
  onChange,
}: {
  participants: ResultParticipant[];
  winnerId: string;
  onChange: (id: string) => void;
}) {
  return (
    <View className="gap-2">
      <Text className="font-mono-bold tabular-nums text-micro text-ink-3 uppercase tracking-caps-xl">
        Winner
      </Text>
      <View className="flex-row gap-2">
        {participants.map((p) => {
          const active = winnerId === p.id;
          return (
            <Pressable
              key={p.id}
              testID={`result-winner-${p.id}`}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => onChange(p.id)}
              className={cn(
                "flex-1 flex-row items-center justify-center gap-1.5 rounded-md border px-3 py-4 active:bg-surface-4",
                selectionSurface(active),
              )}
            >
              {active ? <SelectCheck size={12} /> : null}
              <Text
                className={cn(
                  "shrink text-center font-heading text-small uppercase tracking-caps",
                  active ? "text-ink" : "text-ink-2",
                )}
                numberOfLines={1}
              >
                {p.displayName}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
