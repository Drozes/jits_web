import { Pressable, Text, View } from "react-native";
import { Handshake, Swords } from "lucide-react-native";
import { useThemedTokens } from "@/lib/theme/use-theme";
import { cn } from "@/lib/cn";

export interface ResultParticipant {
  id: string;
  displayName: string;
}

/**
 * Submission / Draw segmented toggle. ELO design system: two chip-style
 * cells inside a hairline-bordered surface, active state lifts to
 * surface-4 with a Signal Red glyph + caps label.
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
      <Text className="font-mono-bold text-[10px] text-ink-3 uppercase tracking-caps-xl">
        Outcome
      </Text>
      <View className="flex-row gap-2 rounded-md bg-surface-3 border border-hairline-strong p-1">
        {(["submission", "draw"] as const).map((opt) => {
          const active = value === opt;
          return (
            <Pressable
              key={opt}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => onChange(opt)}
              className={cn(
                "flex-1 flex-row items-center justify-center gap-2 rounded-xs py-3",
                active ? "bg-surface-4 border border-cta" : "border border-transparent",
              )}
            >
              {opt === "submission" ? (
                <Swords
                  size={14}
                  color={active ? tokens.accentCta : tokens.textTertiary}
                />
              ) : (
                <Handshake
                  size={14}
                  color={active ? tokens.accentCta : tokens.textTertiary}
                />
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
 * Two-button winner picker. ELO design system: two-up cards that
 * tappable, active state gets the Signal Red border + tinted surface.
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
      <Text className="font-mono-bold text-[10px] text-ink-3 uppercase tracking-caps-xl">
        Winner
      </Text>
      <View className="flex-row gap-2">
        {participants.map((p) => {
          const active = winnerId === p.id;
          return (
            <Pressable
              key={p.id}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => onChange(p.id)}
              className={cn(
                "flex-1 rounded-md border bg-surface-3 px-3 py-4 active:bg-surface-4",
                active ? "border-cta bg-surface-4" : "border-hairline-strong",
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
