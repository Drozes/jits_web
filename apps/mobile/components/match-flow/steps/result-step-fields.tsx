import { Pressable, Text, View } from "react-native";
import { Handshake, Swords } from "lucide-react-native";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { cn } from "@/lib/cn";
import { useAmber } from "@/components/match-detail/use-amber";

export interface ResultParticipant {
  id: string;
  displayName: string;
}

/**
 * Submission / Draw segmented toggle. ELO design system: two chip-style
 * cells inside a hairline-bordered surface, active state lifts to
 * surface-4 with an ink border + glyph and a caps label. Never Signal Red:
 * that is reserved for CTAs and state-negative, and a selection is neither.
 * A selected Draw reads amber (draws cost both athletes rating: pressure,
 * not a loss), matching how draws render everywhere else.
 */
export function OutcomeToggle({
  value,
  onChange,
}: {
  value: "submission" | "draw" | null;
  onChange: (v: "submission" | "draw") => void;
}) {
  const tokens = useThemedTokens();
  const amber = useAmber();
  return (
    <View className="gap-2">
      <Text className="font-mono-bold text-[10px] text-ink-3 uppercase tracking-caps-xl">
        Outcome
      </Text>
      <View className="flex-row gap-2 rounded-md bg-surface-3 border border-hairline-strong p-1">
        {(["submission", "draw"] as const).map((opt) => {
          const active = value === opt;
          const activeBorder = opt === "draw" ? amber.border : "border-ink";
          const iconColor = !active
            ? tokens.textTertiary
            : opt === "draw"
              ? amber.icon
              : tokens.textPrimary;
          return (
            <Pressable
              key={opt}
              testID={`result-outcome-${opt}`}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => onChange(opt)}
              className={cn(
                "flex-1 flex-row items-center justify-center gap-2 rounded-xs py-3",
                active ? cn("bg-surface-4 border", activeBorder) : "border border-transparent active:bg-surface-4",
              )}
            >
              {opt === "submission" ? (
                <Swords size={14} color={iconColor} />
              ) : (
                <Handshake size={14} color={iconColor} />
              )}
              <Text
                className={cn(
                  "font-heading text-[11px] uppercase tracking-caps",
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
 * active one gets an ink border + lifted surface (not Signal Red, for the
 * same reason as the outcome toggle above). Mirrors D8 wireframe
 * (lines 1249-1253).
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
      <Text className="font-mono-bold text-[10px] text-ink-3 uppercase tracking-caps-xl">
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
                "flex-1 rounded-md border bg-surface-3 px-3 py-4 active:bg-surface-4",
                active ? "border-ink bg-surface-4" : "border-hairline-strong",
              )}
            >
              <Text
                className={cn(
                  "text-center font-heading text-[12px] uppercase tracking-caps",
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
